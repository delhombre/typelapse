import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { AssetRepositoryPort } from "../src/application/assets/asset-repository.port";
import type { HostedProjectAssetResolverPort } from "../src/application/assets/hosted-project-asset-resolver.port";
import type { ObjectStoragePort } from "../src/application/assets/object-storage.port";
import type { ApiKeyRepositoryPort } from "../src/application/auth/api-key-repository.port";
import type { ProjectDocumentRepositoryPort } from "../src/application/project/project-document-repository.port";
import type { HostedRenderJobService } from "../src/application/render/hosted-render-job";
import type { RenderBySourceService } from "../src/application/render/render-by-source";
import {
	createHostedRenderDownloadService,
	type HostedRenderDownloadService,
} from "../src/application/render/hosted-render-download";
import {
	createHostedRenderPageService,
	type HostedRenderPageService,
} from "../src/application/render/hosted-render-page";
import type { AuthPort } from "../src/domain/ports/auth.port";
import type { MailPort } from "../src/domain/ports/mail.port";
import type { SubscriptionPort } from "../src/domain/ports/subscription.port";
import { Plan } from "../src/domain/value-objects/plan";
import { betterAuthAdapter } from "../src/infrastructure/auth/better-auth.adapter";
import { createApiKeyService } from "./auth/api-keys";
import { authInstance, type AuthInstance } from "./auth/auth-instance";
import type { HostedRenderDeps } from "./auth/hosted-render-guard";
import { createAccountPlanResolver } from "./billing/account-plan";
import { billingServiceFromEnv } from "./billing/billing-from-env";
import type { BillingService } from "./billing/billing-service";
import { type DeploymentMode, deploymentModeFrom } from "./config/deployment-mode";
import { createAccountUsageRepository } from "./db/account-usage.repository";
import { createApiKeyRepository } from "./db/api-key.repository";
import {
	createAssetRepository,
	createHostedProjectAssetResolver,
} from "./db/asset.repository";
import { createBillingProjectionStore } from "./db/billing-projection.store";
import { databaseFromEnv, type CreatorDatabase } from "./db/database";
import { smtpMailFromEnv } from "./mail/smtp-mail";
import { createProjectDocumentRepository } from "./db/project-document.repository";
import {
	createRenderOutputRepository,
	createRenderPageRepository,
} from "./db/render-job.repository";
import { createApiKeysRoute } from "./routes/api-keys";
import { createAssetsRoute } from "./routes/assets";
import { createBillingRoute } from "./routes/billing";
import { createCloudRoute } from "./routes/cloud";
import { createLocalMultimediaRenderRoute } from "./routes/local-multimedia-render";
import { createProjectsRoute } from "./routes/projects";
import { createRenderPageRoute } from "./routes/render-page";
import { renderBySourceServiceFor } from "./render/render-by-source-service";
import { hostedRenderJobServiceFromEnv } from "./render/render-job-service";
import { createStaticSite, staticRootFrom } from "./static/static-site";
import { r2ObjectStorageFromEnv } from "./storage/r2-object-storage";

const MAX_AUTH_REQUEST_BYTES = 64 * 1024;

export interface CreateAppOptions {
	readonly deploymentMode?: DeploymentMode;
	/** Test seam; production lazily loads the real Remotion route in local mode. */
	readonly synchronousRenderRoute?: Hono;
	/** Test seam for the V2 account-free local Remotion renderer. */
	readonly localMultimediaRenderRoute?: Hono;
	readonly database?: CreatorDatabase | null;
	/** Outgoing mail; defaults to SMTP_URL and MAIL_FROM. Sign-in codes leave through it. */
	readonly mail?: MailPort | null;
	readonly auth?: AuthInstance | null;
	readonly authPort?: AuthPort | null;
	readonly apiKeyRepository?: ApiKeyRepositoryPort | null;
	readonly projectRepository?: ProjectDocumentRepositoryPort | null;
	readonly projectAssetResolver?: HostedProjectAssetResolverPort | null;
	readonly assetRepository?: AssetRepositoryPort | null;
	readonly objectStorage?: ObjectStoragePort | null;
	readonly billing?: BillingService | null;
	readonly renderJobs?: HostedRenderJobService | null;
	readonly renderDownloads?: HostedRenderDownloadService | null;
	readonly renderPages?: HostedRenderPageService | null;
	readonly renderSources?: RenderBySourceService | null;
	/** Directory of the Vite build to serve from this origin; null serves none. Defaults to TYPELAPSE_STATIC_ROOT. */
	readonly staticRoot?: string | null;
	readonly logger?: { error(message: string): void };
}

export async function createApp(
	options: CreateAppOptions = {},
): Promise<Hono<{ Variables: { requestId: string } }>> {
	const deploymentMode = options.deploymentMode ?? deploymentModeFrom();
	const logger = options.logger ?? console;
	const app = new Hono<{ Variables: { requestId: string } }>();

	app.use("*", requestId());
	app.onError((_error, c) => {
		const currentRequestId = c.get("requestId");
		logger.error(`Unhandled request failure ${currentRequestId}`);
		return c.json({ error: "Request failed", requestId: currentRequestId }, 500);
	});

	// Only what a browser honours on a JSON or an HTML response. No
	// Content-Security-Policy (the ingress's, #217), no HSTS (the host's domain
	// policy), and no Cross-Origin-Resource/Opener-Policy: their same-origin
	// defaults would cut a studio served from another origin (the dev server, or
	// a separate static host) off from the API's media and any sign-in popup.
	app.use(
		"*",
		secureHeaders({
			xFrameOptions: "DENY",
			referrerPolicy: "strict-origin-when-cross-origin",
			permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
			strictTransportSecurity: false,
			crossOriginResourcePolicy: false,
			crossOriginOpenerPolicy: false,
			originAgentCluster: false,
			xDnsPrefetchControl: false,
			xDownloadOptions: false,
			xPermittedCrossDomainPolicies: false,
			xXssProtection: false,
		}),
	);

	app.use(
		"*",
		cors({
			origin: process.env.CORS_ORIGIN || "http://localhost:5173",
			credentials: true,
			// X-Retry-After is how Better Auth's limiter names the wait. The studio's
			// account island reads it, and a browser on another origin hides what is not listed.
			exposeHeaders: ["X-Request-Id", "X-Retry-After"],
		}),
	);

	const database = options.database === undefined ? databaseFromEnv() : options.database;
	const mail = options.mail === undefined ? smtpMailFromEnv(process.env) : options.mail;
	const auth = options.auth === undefined ? authInstance(database, process.env, mail) : options.auth;
	const authPort =
		options.authPort === undefined ? (auth ? betterAuthAdapter(auth) : null) : options.authPort;
	const apiKeyRepository =
		options.apiKeyRepository === undefined && database
			? createApiKeyRepository(database)
			: (options.apiKeyRepository ?? null);
	// A key needs an account to belong to, so it is mounted with auth or not at all.
	const apiKeys =
		authPort && apiKeyRepository ? createApiKeyService({ repository: apiKeyRepository }) : null;
	const projectRepository =
		options.projectRepository === undefined && database
			? createProjectDocumentRepository(database)
			: (options.projectRepository ?? null);
	const projectAssetResolver =
		options.projectAssetResolver === undefined && database
			? createHostedProjectAssetResolver(database)
			: (options.projectAssetResolver ?? null);
	const assetRepository =
		options.assetRepository === undefined && database
			? createAssetRepository(database)
			: (options.assetRepository ?? null);
	const objectStorage =
		options.objectStorage === undefined ? r2ObjectStorageFromEnv() : options.objectStorage;
	const billing =
		options.billing === undefined && database
			? billingServiceFromEnv({ db: database })
			: (options.billing ?? null);
	const renderJobs =
		options.renderJobs === undefined && database
			? hostedRenderJobServiceFromEnv({ db: database })
			: (options.renderJobs ?? null);
	const renderDownloads =
		options.renderDownloads === undefined && database && objectStorage
			? createHostedRenderDownloadService({
					outputs: createRenderOutputRepository(database),
					storage: objectStorage,
					expiresInSeconds: 60,
				})
			: (options.renderDownloads ?? null);
	/**
	 * Entitlement and quotas come from the durable billing projection whenever a
	 * database exists, even with checkout unconfigured: with no provider no row is
	 * ever written, so every account is free and the free ceilings apply.
	 */
	const subscriptions: SubscriptionPort = database
		? createAccountPlanResolver(createBillingProjectionStore({ db: database }))
		: {
				planFor: async (accountId) => {
					if (!billing) {
						return Plan.free();
					}
					const plan = await billing.planFor(accountId);
					return plan.tier === "creator" ? Plan.pro() : Plan.free();
				},
			};
	// Public pages hang off Cloud renders: no hosted rendering, no page.
	const renderPages =
		options.renderPages === undefined && database && objectStorage && renderJobs
			? createHostedRenderPageService({
					pages: createRenderPageRepository(database),
					storage: objectStorage,
					subscriptions,
				})
			: (options.renderPages ?? null);
	// Render by URL saves a project and queues a job, so it needs the stores and the queue.
	const renderSources =
		options.renderSources === undefined
			? database && projectRepository && renderJobs
				? renderBySourceServiceFor({
					db: database,
					projects: projectRepository,
					jobs: renderJobs,
					githubToken: process.env.TYPELAPSE_GITHUB_TOKEN,
				})
				: null
			: options.renderSources;
	const appUrl = process.env.TYPELAPSE_APP_URL?.trim() || undefined;
	const projectSync = Boolean(authPort && projectRepository && projectAssetResolver);
	const privateAssets = Boolean(authPort && assetRepository && objectStorage);
	const hostedRendering = Boolean(authPort && renderJobs && renderDownloads);

	const health = {
		status: "ok",
		deploymentMode,
		capabilities: {
			auth: Boolean(authPort),
			projectSync,
			privateAssets,
			billing: Boolean(authPort && billing),
			hostedRendering,
			apiKeys: Boolean(apiKeys),
			mail: Boolean(mail),
			localMultimediaRendering: deploymentMode === "local",
		},
	};
	// The capability read decides what the studio offers, so no cache keeps it past a deploy.
	const readHealth = (c: Context) => {
		c.header("Cache-Control", "no-store");
		return c.json(health);
	};
	app.get("/health", readHealth);
	// Also under /api, the one prefix the browser reaches the server by: the
	// client reads it to skip billing when the server has none.
	app.get("/api/health", readHealth);

	if (auth) {
		// Auth payloads are a few hundred bytes. Without a ceiling Better Auth parses
		// whatever arrives, so an anonymous 20 MB sign-in body is buffered and parsed
		// before it is rejected.
		app.use(
			"/api/auth/*",
			bodyLimit({
				maxSize: MAX_AUTH_REQUEST_BYTES,
				onError: (c) => c.json({ error: "Auth request is too large" }, 413),
			}),
		);
		app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
	}
	if (authPort && projectRepository && projectAssetResolver) {
		app.route(
			"/api/projects",
			createProjectsRoute({
				auth: authPort,
				projects: projectRepository,
				assets: projectAssetResolver,
				subscriptions,
			}),
		);
	}
	if (authPort && assetRepository && objectStorage) {
		app.route(
			"/api/assets",
			createAssetsRoute({
				auth: authPort,
				assets: assetRepository,
				storage: objectStorage,
				subscriptions,
			}),
		);
	}

	if (authPort && apiKeys) {
		app.route("/api/keys", createApiKeysRoute({ auth: authPort, keys: apiKeys }));
	}

	// A key opens the hosted render routes below and nothing else.
	const hostedRenderDeps: HostedRenderDeps | undefined = authPort
		? { auth: authPort, subscriptions, ...(apiKeys ? { apiKeys } : {}) }
		: undefined;

	if (deploymentMode === "local") {
		const synchronousRenderRoute =
			options.synchronousRenderRoute ?? (await import("./routes/render")).renderRoute;
		app.route("/api", synchronousRenderRoute);
		app.route(
			"/api",
			options.localMultimediaRenderRoute ?? createLocalMultimediaRenderRoute(),
		);
	}

	// Hosted rendering is always entitlement-gated and accepts canonical project revisions only.
	app.route(
		"/api/cloud",
		createCloudRoute({
			...(hostedRenderDeps ?? {
				auth: { verify: async () => null },
				subscriptions: { planFor: async () => Plan.free() },
			}),
			...(renderJobs && renderDownloads ? { renderJobs, renderDownloads } : {}),
			...(renderPages ? { renderPages } : {}),
			...(renderSources ? { renderSources } : {}),
			...(appUrl ? { appUrl } : {}),
		}),
	);
	if (renderPages) {
		// The app's origin routes /v/* here, as it does /api/*: crawlers read this
		// document, they never run the SPA.
		app.route("/v", createRenderPageRoute({ pages: renderPages, ...(appUrl ? { appUrl } : {}) }));
	}
	app.route(
		"/api/billing",
		createBillingRoute({
			auth: authPort ?? { verify: async () => null },
			billing,
			subscriptions,
			...(database ? { usage: createAccountUsageRepository(database) } : {}),
		}),
	);

	// Last, so it only sees what no API route answered.
	const staticRoot = options.staticRoot === undefined ? staticRootFrom() : options.staticRoot;
	if (staticRoot) {
		app.use("*", createStaticSite(staticRoot));
	}

	return app;
}

async function startServer(): Promise<void> {
	const deploymentMode = deploymentModeFrom();
	const app = await createApp({ deploymentMode });
	const port = Number(process.env.PORT) || 3001;
	console.log(`Typelapse server running on http://localhost:${port}`);
	console.log(`Deployment mode: ${deploymentMode}`);
	console.log("Runtime capabilities: GET /health");

	serve({ fetch: app.fetch, port });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	void startServer();
}
