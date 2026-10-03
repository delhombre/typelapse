import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createApp } from "../../server/index";
import type { AuthInstance } from "../../server/auth/auth-instance";
import type { BillingService } from "../../server/billing/billing-service";
import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import type { HostedProjectAssetResolverPort } from "../../src/application/assets/hosted-project-asset-resolver.port";
import type { ObjectStoragePort } from "../../src/application/assets/object-storage.port";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import type { HostedRenderDownloadService } from "../../src/application/render/hosted-render-download";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { AuthPort } from "../../src/domain/ports/auth.port";

const signedIn: AuthPort = {
	verify: async () => ({
		accountId: "account-1",
		expiresAt: new Date(Date.now() + 60_000),
	}),
};

const projects: ProjectDocumentRepositoryPort = {
	create: async () => {
		throw new Error("not needed");
	},
	findOwnedById: async () => null,
	listByOwner: async () => [],
	update: async () => ({ outcome: "not-found" }),
	deleteOwnedById: async () => false,
};

const assets: AssetRepositoryPort = {
	reservePending: async () => ({ outcome: "not-found" }),
	findOwnedById: async () => null,
	listByOwner: async () => [],
	finalizeReady: async () => ({ outcome: "not-found" }),
	markFailed: async () => ({ outcome: "not-found" }),
	deleteOwnedIfUnreferenced: async () => ({ outcome: "not-found" }),
};

const projectAssets: HostedProjectAssetResolverPort = {
	resolveReadyForProject: async () => [],
};

const storage: ObjectStoragePort = {
	signPut: async () => {
		throw new Error("not needed");
	},
	signGet: async () => {
		throw new Error("not needed");
	},
	verifyObject: async () => null,
	deleteObject: async () => undefined,
};

const creatorBilling: BillingService = {
	catalog: async () => ({
		creator: { monthly: { currency: "EUR", unitAmount: 1200 } },
	}),
	planFor: async () => ({ tier: "creator", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
	startCheckout: async () => ({ id: "cs_1", url: "https://stripe.test/checkout" }),
	openPortal: async () => ({ url: "https://stripe.test/portal" }),
	processWebhook: async () => ({ outcome: "processed" }),
};

const renderJobs: HostedRenderJobService = {
	submit: async () => ({
		outcome: "accepted",
		job: {
			id: "job-1",
			projectId: "project-1",
			revision: 1,
			status: "queued",
			createdAt: new Date(),
			completedAt: null,
		},
	}),
	status: async () => null,
};

const renderDownloads: HostedRenderDownloadService = {
	open: async () => ({ outcome: "not-ready" }),
};

const renderRequest = new Request("http://localhost/api/cloud/render", {
	method: "POST",
	headers: { "content-type": "application/json", cookie: "session=valid" },
	body: JSON.stringify({
		projectId: "project-1",
		revision: 1,
		renderOptions: {
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 30,
			includeAudio: true,
		},
	}),
});

describe("createApp hosted capabilities", () => {
	it("mounts the account-free multimedia renderer only in local deployment mode", async () => {
		const localRoute = new Hono().post("/render/v2", (c) => c.body("local-v2", 200));
		const local = await createApp({
			deploymentMode: "local",
			synchronousRenderRoute: new Hono(),
			localMultimediaRenderRoute: localRoute,
			database: null,
			auth: null,
		});
		const hosted = await createApp({
			deploymentMode: "hosted",
			localMultimediaRenderRoute: localRoute,
			database: null,
			auth: null,
		});

		const localRender = await local.request("http://localhost/api/render/v2", { method: "POST" });
		const hostedRender = await hosted.request("http://localhost/api/render/v2", {
			method: "POST",
		});
		const localHealth = await local.request("http://localhost/health");
		const hostedHealth = await hosted.request("http://localhost/health");

		expect(localRender.status).toBe(200);
		expect(await localRender.text()).toBe("local-v2");
		expect(hostedRender.status).toBe(404);
		expect(await localHealth.json()).toMatchObject({
			capabilities: { localMultimediaRendering: true },
		});
		expect(await hostedHealth.json()).toMatchObject({
			capabilities: { localMultimediaRendering: false },
		});
	});

	it("mounts authenticated projects and private assets only when every adapter exists", async () => {
		const app = await createApp({
			deploymentMode: "hosted",
			authPort: signedIn,
			projectRepository: projects,
			projectAssetResolver: projectAssets,
			assetRepository: assets,
			objectStorage: storage,
		});

		const projectList = await app.request("http://localhost/api/projects", {
			headers: { cookie: "session=valid" },
		});
		const assetList = await app.request("http://localhost/api/assets", {
			headers: { cookie: "session=valid" },
		});
		const health = await app.request("http://localhost/health");

		expect(projectList.status).toBe(200);
		expect(assetList.status).toBe(200);
		expect(await assetList.json()).toEqual({ assets: [] });
		expect(await health.json()).toMatchObject({
			status: "ok",
			deploymentMode: "hosted",
			capabilities: {
				auth: true,
				projectSync: true,
				privateAssets: true,
			},
		});
	});

	it("fails closed when private storage is only partially configured", async () => {
		const app = await createApp({
			deploymentMode: "hosted",
			authPort: signedIn,
			projectRepository: projects,
			projectAssetResolver: projectAssets,
			assetRepository: assets,
			objectStorage: null,
		});

		const response = await app.request("http://localhost/api/assets", {
			headers: { cookie: "session=valid" },
		});
		const health = await app.request("http://localhost/health");

		expect(response.status).toBe(404);
		expect(await health.json()).toMatchObject({
			capabilities: { auth: true, projectSync: true, privateAssets: false },
		});
	});

	it("advertises and accepts hosted rendering only when submission and private output access exist", async () => {
		const incomplete = await createApp({
			deploymentMode: "hosted",
			authPort: signedIn,
			billing: creatorBilling,
			renderJobs,
			renderDownloads: null,
		});
		const complete = await createApp({
			deploymentMode: "hosted",
			authPort: signedIn,
			billing: creatorBilling,
			renderJobs,
			renderDownloads,
		});

		const unavailable = await incomplete.request(renderRequest.clone());
		const accepted = await complete.request(renderRequest.clone());
		const incompleteHealth = await incomplete.request("http://localhost/health");
		const completeHealth = await complete.request("http://localhost/health");

		expect(unavailable.status).toBe(503);
		expect(accepted.status).toBe(202);
		expect(await incompleteHealth.json()).toMatchObject({
			capabilities: { hostedRendering: false },
		});
		expect(await completeHealth.json()).toMatchObject({
			capabilities: { hostedRendering: true },
		});
	});

	it("returns one safe request-correlated error without logging secret details", async () => {
		const errors: string[] = [];
		const app = await createApp({
			deploymentMode: "hosted",
			authPort: signedIn,
			projectRepository: {
				...projects,
				listByOwner: async () => {
					throw new Error("DATABASE_URL=never-log-this");
				},
			},
			projectAssetResolver: projectAssets,
			logger: { error: (message) => errors.push(message) },
		});

		const response = await app.request("http://localhost/api/projects", {
			headers: { cookie: "session=valid", "x-request-id": "request_123" },
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Request failed", requestId: "request_123" });
		expect(response.headers.get("x-request-id")).toBe("request_123");
		expect(errors).toEqual(["Unhandled request failure request_123"]);
		expect(errors.join(" ")).not.toContain("never-log-this");
	});

	it("refuses oversized auth bodies before Better Auth parses them", async () => {
		const parsedBodies: number[] = [];
		const auth = {
			handler: async (request: Request) => {
				parsedBodies.push((await request.text()).length);
				return new Response(null, { status: 401 });
			},
		} as unknown as AuthInstance;
		const app = await createApp({
			deploymentMode: "hosted",
			database: null,
			auth,
			authPort: null,
		});
		const signIn = (body: string) =>
			app.request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			});

		const oversized = await signIn(JSON.stringify({ password: "a".repeat(20 * 1024 * 1024) }));
		const ordinary = await signIn(JSON.stringify({ email: "qa@example.test", password: "x" }));

		expect(oversized.status).toBe(413);
		expect(ordinary.status).toBe(401);
		expect(parsedBodies).toHaveLength(1);
	});
});
