# syntax=docker/dockerfile:1
#
# One image, three processes: the API (default CMD), `worker:render` and
# `worker:object-deletion`. docs/launch/deploy.md has the commands.
# Build for the cluster's architecture: docker build --platform linux/amd64 .

ARG NODE_VERSION=24

# --- build: dependencies, the Vite build and the headless browser ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

# pnpm at the version package.json pins.
COPY package.json ./
RUN corepack enable && corepack install

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Hosted renders need Remotion's browser at run time, and the runtime user has
# no business downloading one. This layer only depends on the lockfile.
RUN pnpm exec remotion browser ensure

COPY . .

# Baked into the client bundle (and TYPELAPSE_APP_URL into its share-card tags).
# The defaults are the local, account-free studio; pass --build-arg for hosted.
ARG VITE_TYPELAPSE_DEPLOYMENT_MODE=local
ARG VITE_TYPELAPSE_AUTH_ENABLED=false
ARG VITE_BETTER_AUTH_URL=
ARG TYPELAPSE_APP_URL=
RUN pnpm build

# The release step runs `drizzle-kit migrate`, a dev dependency. Copy it, with
# the exact versions of its own dependencies, out of the virtual store before
# the dev dependencies go; pnpm links each of them next to it, esbuild's native
# binary among them, which is copied beside esbuild by hand. Its drizzle-orm
# and pg peers are the application's own.
RUN mkdir -p /opt/drizzle-kit \
	&& cp -rL node_modules/.pnpm/drizzle-kit@*/node_modules /opt/drizzle-kit/node_modules \
	&& cp -rL node_modules/.pnpm/esbuild@0.25.*/node_modules/@esbuild /opt/drizzle-kit/node_modules/@esbuild \
	&& CI=true pnpm prune --prod \
	&& ln -s /app/node_modules/drizzle-orm /opt/drizzle-kit/node_modules/drizzle-orm \
	&& ln -s /app/node_modules/pg /opt/drizzle-kit/node_modules/pg \
	&& ln -s /opt/drizzle-kit/node_modules/drizzle-kit node_modules/drizzle-kit \
	&& ln -s ../drizzle-kit/bin.cjs node_modules/.bin/drizzle-kit

# --- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# Chrome Headless Shell's shared libraries (Remotion's "Linux dependencies" for
# Debian), tini so a stop signal reaches the process, and CA certificates for
# the database, the object store and Polar. Remotion 4 ships its own compositor
# with ffmpeg, so none is installed here.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		tini \
		libnss3 \
		libdbus-1-3 \
		libatk1.0-0 \
		libatk-bridge2.0-0 \
		libgbm1 \
		libasound2 \
		libxrandr2 \
		libxkbcommon0 \
		libxfixes3 \
		libxcomposite1 \
		libxdamage1 \
		libpango-1.0-0 \
		libcairo2 \
		libcups2 \
	&& rm -rf /var/lib/apt/lists/*

# uid/gid 1001, the one the cluster's pod security context runs as.
RUN groupadd --gid 1001 typelapse \
	&& useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin typelapse

# pnpm is baked in, so `pnpm hosted:check` and `pnpm db:migrate` need no network.
ENV COREPACK_HOME=/opt/corepack \
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json /tmp/package.json
RUN cd /tmp && corepack enable && corepack install && rm package.json \
	&& chown -R typelapse:typelapse /opt/corepack

# Per-job render workspaces. Mount a volume here if renders outgrow the disk.
RUN mkdir -p /var/lib/typelapse/render && chown typelapse:typelapse /var/lib/typelapse/render

WORKDIR /app
# The API and the workers run from source through tsx, and the Remotion bundler
# compiles server/remotion and src/ at run time, so the tree travels with the
# build. .dockerignore keeps .env and every other secret out.
COPY --from=build --chown=typelapse:typelapse /app /app
COPY --from=build --chown=typelapse:typelapse /opt/drizzle-kit /opt/drizzle-kit

# One frame at a time: a container sees its node's cores, not its own limit, so
# Remotion's default (half the cores it sees) would oversubscribe it.
#
# pnpm checks the dependencies before every script and would try to reinstall
# the development ones this image deliberately lacks.
ENV NODE_ENV=production \
	PATH=/app/node_modules/.bin:$PATH \
	pnpm_config_verify_deps_before_run=false \
	PORT=3001 \
	TYPELAPSE_STATIC_ROOT=/app/dist \
	TYPELAPSE_RENDER_TEMP_ROOT=/var/lib/typelapse/render \
	TYPELAPSE_RENDER_CONCURRENCY=1

USER 1001:1001
EXPOSE 3001
ENTRYPOINT ["tini", "--"]
# The API. The workers are the same image with another command:
#   tsx server/workers/hosted-render.entrypoint.ts
#   tsx server/workers/object-deletion.entrypoint.ts
CMD ["tsx", "server/index.ts"]
