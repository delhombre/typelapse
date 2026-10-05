import { describe, expect, it } from "vitest";
import type { BillingService } from "../../server/billing/billing-service";
import { createApp } from "../../server/index";
import type { ApiKeyRepositoryPort } from "../../src/application/auth/api-key-repository.port";
import type { ProjectDocumentRepositoryPort } from "../../src/application/project/project-document-repository.port";
import type { HostedRenderDownloadService } from "../../src/application/render/hosted-render-download";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { RenderBySourceService } from "../../src/application/render/render-by-source";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

/**
 * Render by URL in the hosted app: mounted under the same guard as the other
 * render routes, so a key opens it, and a free account is answered whatever the
 * deployment can render.
 */

const signedIn: AuthPort = {
	verify: async () => ({ accountId: "account-1", expiresAt: new Date(Date.now() + 60_000) }),
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

const billing = (tier: "creator" | "free"): BillingService => ({
	catalog: async () => ({ creator: { monthly: { currency: "EUR", unitAmount: 1200 } } }),
	planFor: async () => ({ tier, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
	startCheckout: async () => ({ id: "cs_1", url: "https://stripe.test/checkout" }),
	openPortal: async () => ({ url: "https://stripe.test/portal" }),
	processWebhook: async () => ({ outcome: "processed" }),
});

function hostedApp(
	options: {
		tier?: "creator" | "free";
		renderSources?: RenderBySourceService | null;
		apiKeyRepository?: ApiKeyRepositoryPort;
	} = {},
) {
	return createApp({
		deploymentMode: "hosted",
		database: null,
		auth: null,
		authPort: signedIn,
		apiKeyRepository: options.apiKeyRepository ?? new MemoryApiKeyRepository(),
		projectRepository: projects,
		billing: billing(options.tier ?? "creator"),
		renderJobs,
		renderDownloads,
		...(options.renderSources === undefined ? {} : { renderSources: options.renderSources }),
	});
}

async function newKey(app: Awaited<ReturnType<typeof hostedApp>>): Promise<string> {
	const response = await app.request("http://localhost/api/keys", {
		method: "POST",
		headers: { "content-type": "application/json", cookie: "session=valid" },
		body: JSON.stringify({ name: "ci" }),
	});
	return (await response.json()).key as string;
}

const renderUrl = (headers: Record<string, string>) =>
	new Request("http://localhost/api/cloud/render/source", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({ source: "https://github.com/octocat/Hello-World/pull/1" }),
	});

describe("render by URL in the hosted app", () => {
	it("is opened by a key, for the account that owns it", async () => {
		const seen: string[] = [];
		const renderSources: RenderBySourceService = {
			submit: async (request) => {
				seen.push(request.ownerId);
				return { outcome: "queued", job };
			},
		};
		const app = await hostedApp({ renderSources });
		const key = await newKey(app);

		const response = await app.request(renderUrl({ authorization: `Bearer ${key}` }));

		expect(response.status).toBe(202);
		expect((await response.json()).studioUrl).toMatch(/^http:\/\/localhost\/app#import=/);
		expect(seen).toEqual(["account-1"]);
	});

	it("is refused to a caller with no credential, as the render route is", async () => {
		const app = await hostedApp({
			renderSources: { submit: async () => ({ outcome: "conflict" }) },
		});

		const response = await app.request(
			new Request("http://localhost/api/cloud/render/source", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ source: "https://github.com/octocat/Hello-World/pull/1" }),
			}),
		);

		expect(response.status).toBe(401);
	});

	it("is a 503 for a Creator when this deployment cannot render it", async () => {
		const app = await hostedApp({ renderSources: null });

		const response = await app.request(renderUrl({ cookie: "session=valid" }));

		expect(response.status).toBe(503);
	});

	it("still hands a free account the studio link when this deployment cannot render it", async () => {
		const app = await hostedApp({ tier: "free", renderSources: null });

		const response = await app.request(renderUrl({ cookie: "session=valid" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			studioUrl: expect.stringMatching(/^http:\/\/localhost\/app#import=/),
			reason: { code: "plan-limit", plan: "free" },
		});
	});
});
