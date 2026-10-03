import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { AssetRepositoryPort } from "../src/application/assets/asset-repository.port";
import type { HostedProjectAssetResolverPort } from "../src/application/assets/hosted-project-asset-resolver.port";
import type { ObjectStoragePort } from "../src/application/assets/object-storage.port";
import type { ProjectDocumentRepositoryPort } from "../src/application/project/project-document-repository.port";
import type { HostedRenderJobService } from "../src/application/render/hosted-render-job";
import {
	createHostedRenderDownloadService,
	type HostedRenderDownloadService,
} from "../src/application/render/hosted-render-download";
import type { AuthPort } from "../src/domain/ports/auth.port";
import { Plan } from "../src/domain/value-objects/plan";
import { betterAuthAdapter } from "../src/infrastructure/auth/better-auth.adapter";
import { authInstance, type AuthInstance } from "./auth/auth-instance";
import type { HostedRenderDeps } from "./auth/hosted-render-guard";
import { billingServiceFromEnv } from "./billing/billing-from-env";
import type { BillingService } from "./billing/billing-service";
import { type DeploymentMode, deploymentModeFrom } from "./config/deployment-mode";
import {
	createAssetRepository,
	createHostedProjectAssetResolver,
} from "./db/asset.repository";
import { databaseFromEnv, type CreatorDatabase } from "./db/database";
import { createProjectDocumentRepository } from "./db/project-document.repository";
import { createRenderOutputRepository } from "./db/render-job.repository";
import { createAssetsRoute } from "./routes/assets";
import { createBillingRoute } from "./routes/billing";
import { createCloudRoute } from "./routes/cloud";
import { createLocalMultimediaRenderRoute } from "./routes/local-multimedia-render";
import { createProjectsRoute } from "./routes/projects";
import { hostedRenderJobServiceFromEnv } from "./render/render-job-service";
import { r2ObjectStorageFromEnv } from "./storage/r2-object-storage";

const MAX_AUTH_REQUEST_BYTES = 64 * 1024;

export interface CreateAppOptions {
	readonly deploymentMode?: DeploymentMode;
	/** Test seam; production lazily loads the real Remotion route in local mode. */
	readonly synchronousRenderRoute?: Hono;
	/** Test seam for the V2 account-free local Remotion renderer. */
	readonly localMultimediaRenderRoute?: Hono;
	readonly database?: CreatorDatabase | null;
	readonly auth?: AuthInstance | null;
	readonly authPort?: AuthPort | null;
	readonly projectRepository?: ProjectDocumentRepositoryPort | null;
	readonly projectAssetResolver?: HostedProjectAssetResolverPort | null;
	readonly assetRepository?: AssetRepositoryPort | null;
	readonly objectStorage?: ObjectStoragePort | null;
	readonly billing?: BillingService | null;
	readonly renderJobs?: HostedRenderJobService | null;
	readonly renderDownloads?: HostedRenderDownloadService | null;
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

	app.use(
		"*",
		cors({
			origin: process.env.CORS_ORIGIN || "http://localhost:5173",
			credentials: true,
			exposeHeaders: ["X-Request-Id"],
		}),
	);

	const database = options.database === undefined ? databaseFromEnv() : options.database;
	const auth = options.auth === undefined ? authInstance(database) : options.auth;
	const authPort =
		options.authPort === undefined ? (auth ? betterAuthAdapter(auth) : null) : options.authPort;
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
	const projectSync = Boolean(authPort && projectRepository && projectAssetResolver);
	const privateAssets = Boolean(authPort && assetRepository && objectStorage);
	const hostedRendering = Boolean(authPort && renderJobs && renderDownloads);

	app.get("/health", (c) =>
		c.json({
			status: "ok",
			deploymentMode,
			capabilities: {
				auth: Boolean(authPort),
				projectSync,
				privateAssets,
				billing: Boolean(authPort && billing),
				hostedRendering,
				localMultimediaRendering: deploymentMode === "local",
			},
		}),
	);

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
			}),
		);
	}
	if (authPort && assetRepository && objectStorage) {
		app.route(
			"/api/assets",
			createAssetsRoute({ auth: authPort, assets: assetRepository, storage: objectStorage }),
		);
	}

	/** Hosted entitlements come from the durable Stripe projection when configured. */
	const hostedRenderDeps: HostedRenderDeps | undefined = authPort
		? {
				auth: authPort,
				subscriptions: {
					planFor: async (accountId) => {
						if (!billing) {
							return Plan.free();
						}
						const plan = await billing.planFor(accountId);
						return plan.tier === "creator" ? Plan.pro() : Plan.free();
					},
				},
			}
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
		}),
	);
	app.route(
		"/api/billing",
		createBillingRoute({
			auth: authPort ?? { verify: async () => null },
			billing,
		}),
	);

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
