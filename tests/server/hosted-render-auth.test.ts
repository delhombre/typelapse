import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCloudRoute, cloudRoute } from "../../server/routes/cloud";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import { Plan } from "../../src/domain/value-objects/plan";

const hostedApp = (route = cloudRoute) => new Hono().route("/api/cloud", route);

const renderRequest = (headers: Record<string, string>) => {
	return new Request("http://localhost/api/cloud/render", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
	body: JSON.stringify({
		projectId: "project-1",
		revision: 4,
		renderOptions: {
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: true,
		},
	}),
	});
};

const signedInAs = (accountId: string): AuthPort => ({
	verify: async () => ({
		accountId,
		expiresAt: new Date(Date.now() + 60_000),
	}),
});

const on = (plan: Plan): SubscriptionPort => ({ planFor: async () => plan });

const renderJobs: HostedRenderJobService = {
	submit: async () => ({
		outcome: "accepted",
		job: {
			id: "job_1",
			projectId: "project-1",
			revision: 4,
			status: "queued",
			createdAt: new Date(),
			completedAt: null,
		},
	}),
	status: async (_ownerId, jobId) =>
		jobId === "job_1"
			? {
					id: jobId,
					projectId: "project-1",
					revision: 4,
					status: "queued",
					createdAt: new Date(),
					completedAt: null,
				}
			: null,
};

describe("hosted render authentication", () => {
	it("refuses a request that claims a plan but carries no session", async () => {
		const response = await hostedApp().request(
			renderRequest({ "x-typelapse-plan": "pro" }),
		);

		expect(response.status).toBe(401);
	});

	it("refuses an anonymous request", async () => {
		const response = await hostedApp().request(renderRequest({}));

		expect(response.status).toBe(401);
	});

	it("never lets a client header decide entitlement", async () => {
		const response = await hostedApp().request(
			renderRequest({ "x-typelapse-plan": "team" }),
		);

		expect(response.status).not.toBe(202);
	});

	it("guards job status too, so job ids cannot be probed anonymously", async () => {
		const response = await hostedApp().request(
			"http://localhost/api/cloud/jobs/job_1",
		);

		expect(response.status).toBe(401);
	});
});

describe("hosted render entitlement", () => {
	it("asks a signed-in free account to upgrade rather than to sign in", async () => {
		const route = createCloudRoute({
			auth: signedInAs("acc_1"),
			subscriptions: on(Plan.free()),
		});

		const response = await hostedApp(route).request(
			renderRequest({ cookie: "session=valid" }),
		);

		expect(response.status).toBe(402);
	});

	it("accepts a signed-in account whose plan includes hosted rendering", async () => {
		const route = createCloudRoute({
			auth: signedInAs("acc_1"),
			subscriptions: on(Plan.pro()),
			renderJobs,
		});

		const response = await hostedApp(route).request(
			renderRequest({ cookie: "session=valid" }),
		);

		expect(response.status).toBe(202);
	});

	it("still validates the payload once the caller is entitled", async () => {
		const route = createCloudRoute({
			auth: signedInAs("acc_1"),
			subscriptions: on(Plan.pro()),
			renderJobs,
		});

		const response = await hostedApp(route).request(
			new Request("http://localhost/api/cloud/render", {
				method: "POST",
				headers: { "content-type": "application/json", cookie: "session=valid" },
				body: JSON.stringify({ projectId: "project-1", revision: 4 }),
			}),
		);

		expect(response.status).toBe(400);
	});

	it("keeps the cookie when a bearer header is also present", async () => {
		let seen = "";
		const route = createCloudRoute({
			auth: {
				verify: async (credential) => {
					seen = credential;
					return { accountId: "acc_1", expiresAt: new Date(Date.now() + 60_000) };
				},
			},
			subscriptions: on(Plan.pro()),
			renderJobs,
		});

		const response = await hostedApp(route).request(
			renderRequest({
				cookie: "better-auth.session_token=valid",
				authorization: "Bearer tok_that_nothing_can_verify",
			}),
		);

		expect(seen).toBe("better-auth.session_token=valid");
		expect(response.status).toBe(202);
	});

	it("ignores a bearer header on its own, since no bearer plugin is enabled", async () => {
		const route = createCloudRoute({
			auth: signedInAs("acc_1"),
			subscriptions: on(Plan.pro()),
		});

		const response = await hostedApp(route).request(
			renderRequest({ authorization: "Bearer tok_abc" }),
		);

		expect(response.status).toBe(401);
	});

	it("refuses an expired session even though the provider returned one", async () => {
		const expired: AuthPort = {
			verify: async () => ({
				accountId: "acc_1",
				expiresAt: new Date(Date.now() - 60_000),
			}),
		};

		const route = createCloudRoute({
			auth: expired,
			subscriptions: on(Plan.pro()),
		});

		const response = await hostedApp(route).request(
			renderRequest({ cookie: "session=stale" }),
		);

		expect(response.status).toBe(401);
	});
});
