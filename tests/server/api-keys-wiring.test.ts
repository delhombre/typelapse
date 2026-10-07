import { describe, expect, it } from "vitest";
import type { BillingService } from "../../server/billing/billing-service";
import { createApp } from "../../server/index";
import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import type { HostedProjectAssetResolverPort } from "../../src/application/assets/hosted-project-asset-resolver.port";
import type { ObjectStoragePort } from "../../src/application/assets/object-storage.port";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import type { HostedRenderDownloadService } from "../../src/application/render/hosted-render-download";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

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
	existsOwnedById: async () => false,
	listByOwner: async () => [],
	update: async () => ({ outcome: "not-found" }),
	createAutomation: async () => {
		throw new Error("not needed");
	},
	updateAutomation: async () => ({ outcome: "not-found" }),
	deleteOwnedById: async () => "not-found",
};

const assets: AssetRepositoryPort = {
	reservePending: async () => ({ outcome: "not-found" }),
	findOwnedById: async () => null,
	listByOwner: async () => [],
	finalizeReady: async () => ({ outcome: "not-found" }),
	markFailed: async () => ({ outcome: "not-found" }),
	deleteOwnedIfUnreferenced: async () => ({ outcome: "not-found" }),
};

const projectAssets: HostedProjectAssetResolverPort = { resolveReadyForProject: async () => [] };

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

const billing: BillingService = {
	catalog: async () => ({ creator: { monthly: { currency: "EUR", unitAmount: 1200 } } }),
	planFor: async () => ({
		tier: "creator",
		status: "active",
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		since: null,
	}),
	startCheckout: async () => ({ id: "cs_1", url: "https://polar.test/checkout" }),
	openPortal: async () => ({ url: "https://polar.test/portal" }),
	processWebhook: async () => ({ outcome: "processed" }),
};

const job = {
	id: "job-1",
	projectId: "project-1",
	revision: 1,
	status: "queued" as const,
	createdAt: new Date(),
	completedAt: null,
};
const renderJobs: HostedRenderJobService = {
	submit: async () => ({ outcome: "accepted", job }),
	status: async () => job,
};
const renderDownloads: HostedRenderDownloadService = {
	open: async () => ({ outcome: "not-ready" }),
};

function hostedApp(apiKeyRepository: MemoryApiKeyRepository | null = new MemoryApiKeyRepository()) {
	return createApp({
		deploymentMode: "hosted",
		database: null,
		auth: null,
		authPort: signedIn,
		apiKeyRepository,
		projectRepository: projects,
		projectAssetResolver: projectAssets,
		assetRepository: assets,
		objectStorage: storage,
		billing,
		renderJobs,
		renderDownloads,
	});
}

const asAccount = { cookie: "session=valid" };

async function newKey(app: Awaited<ReturnType<typeof hostedApp>>) {
	const response = await app.request("http://localhost/api/keys", {
		method: "POST",
		headers: { "content-type": "application/json", ...asAccount },
		body: JSON.stringify({ name: "ci" }),
	});
	const body = await response.json();
	return { key: body.key as string, prefix: body.created.prefix as string };
}

function render(headers: Record<string, string>) {
	return new Request("http://localhost/api/cloud/render", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({
			projectId: "project-1",
			revision: 1,
			renderOptions: { format: "mp4", width: 1920, height: 1080, fps: 30, includeAudio: true },
		}),
	});
}

describe("API keys in the hosted app", () => {
	it("starts a render and reads its job, and opens nothing else", async () => {
		const app = await hostedApp();
		const { key } = await newKey(app);
		const withKey = { authorization: `Bearer ${key}` };
		const json = { "content-type": "application/json", ...withKey };

		const allowed = [
			await app.request(render(withKey)),
			await app.request("http://localhost/api/cloud/jobs/job-1", { headers: withKey }),
		];
		const refused = [
			await app.request("http://localhost/api/keys", { headers: withKey }),
			await app.request("http://localhost/api/keys", {
				method: "POST",
				headers: json,
				body: JSON.stringify({ name: "a key minted by a key" }),
			}),
			await app.request("http://localhost/api/projects", { headers: withKey }),
			await app.request("http://localhost/api/assets", { headers: withKey }),
			await app.request("http://localhost/api/billing/plan", { headers: withKey }),
			await app.request("http://localhost/api/billing/checkout", {
				method: "POST",
				headers: json,
				body: JSON.stringify({ cadence: "monthly" }),
			}),
			await app.request("http://localhost/api/billing/portal", {
				method: "POST",
				headers: withKey,
			}),
		];

		expect(allowed.map((response) => response.status)).toEqual([202, 200]);
		expect(refused.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
	});

	it("stops with the revocation, on the next request", async () => {
		const app = await hostedApp();
		const { key, prefix } = await newKey(app);
		const withKey = { authorization: `Bearer ${key}` };
		expect((await app.request(render(withKey))).status).toBe(202);

		const revoked = await app.request(`http://localhost/api/keys/${prefix}`, {
			method: "DELETE",
			headers: asAccount,
		});
		const after = await app.request(render(withKey));

		expect(revoked.status).toBe(204);
		expect(after.status).toBe(401);
	});

	it("is a capability the health check names, present only with a repository behind it", async () => {
		const mounted = await hostedApp();
		const unmounted = await hostedApp(null);

		const mountedHealth = await mounted.request("http://localhost/health");
		const unmountedHealth = await unmounted.request("http://localhost/health");
		const unmountedKeys = await unmounted.request("http://localhost/api/keys", {
			headers: asAccount,
		});

		expect(await mountedHealth.json()).toMatchObject({ capabilities: { apiKeys: true } });
		expect(await unmountedHealth.json()).toMatchObject({ capabilities: { apiKeys: false } });
		expect(unmountedKeys.status).toBe(404);
	});

	it("authenticates nobody by key when there is no account provider at all", async () => {
		const app = await createApp({
			deploymentMode: "hosted",
			database: null,
			auth: null,
			authPort: null,
			apiKeyRepository: new MemoryApiKeyRepository(),
			renderJobs,
			renderDownloads,
		});

		const response = await app.request(
			render({ authorization: `Bearer tlk_00000000_${"0".repeat(64)}` }),
		);
		const health = await app.request("http://localhost/health");

		expect(response.status).toBe(401);
		expect(await health.json()).toMatchObject({ capabilities: { apiKeys: false } });
	});
});
