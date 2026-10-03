import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
	type BillingService,
	InvalidBillingWebhookSignatureError,
} from "../../server/billing/billing-service";
import { createBillingRoute } from "../../server/routes/billing";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";

const NOW = new Date("2026-08-30T20:00:00.000Z");

class FakeBilling implements BillingService {
	webhookInput: readonly [string, string] | null = null;
	checkoutUser: string | null = null;
	portalUser: string | null = null;
	webhookError: Error | null = null;
	checkoutCadence: "monthly" | "annual" | null = null;

	async catalog() {
		return {
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		};
	}

	async planFor() {
		return { tier: "creator" as const, currentPeriodEnd: null, cancelAtPeriodEnd: false };
	}

	async startCheckout(userId: string, cadence: "monthly" | "annual") {
		this.checkoutUser = userId;
		this.checkoutCadence = cadence;
		return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
	}

	async openPortal(userId: string) {
		this.portalUser = userId;
		return { url: "https://billing.stripe.test/bps_1" };
	}

	async processWebhook(rawBody: string, signature: string) {
		this.webhookInput = [rawBody, signature];
		if (this.webhookError) {
			throw this.webhookError;
		}
		return { outcome: "processed" as const };
	}
}

function auth(accountId = "user-1"): AuthPort {
	return {
		verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
	};
}

function appFor(input: { auth?: AuthPort; billing?: BillingService } = {}) {
	return new Hono().route(
		"/api/billing",
		createBillingRoute({
			auth: input.auth ?? auth(),
			billing: input.billing ?? new FakeBilling(),
			now: () => NOW,
		}),
	);
}

function accountRequest(path: string, method = "GET"): Request {
	return new Request(`http://localhost${path}`, {
		method,
		headers: { cookie: "session=valid" },
	});
}

describe("billing route", () => {
	it("publishes the configured price catalog without requiring an account", async () => {
		const app = appFor({ auth: { verify: async () => null } });

		const response = await app.request("http://localhost/api/billing/catalog");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		});
	});

	it("keeps Checkout, Portal and plan behind an active account", async () => {
		const app = appFor({ auth: { verify: async () => null } });

		for (const [path, method] of [
			["/api/billing/plan", "GET"],
			["/api/billing/checkout", "POST"],
			["/api/billing/portal", "POST"],
		] as const) {
			const response = await app.request(accountRequest(path, method));
			expect(response.status).toBe(401);
		}
	});

	it("returns the authoritative plan and server-created redirect URLs", async () => {
		const billing = new FakeBilling();
		const app = appFor({ billing });

		const plan = await app.request(accountRequest("/api/billing/plan"));
		const checkout = await app.request(
			new Request("http://localhost/api/billing/checkout", {
				method: "POST",
				headers: { cookie: "session=valid", "content-type": "application/json" },
				body: JSON.stringify({ cadence: "annual" }),
			}),
		);
		const portal = await app.request(accountRequest("/api/billing/portal", "POST"));

		expect(await plan.json()).toEqual({
			plan: { tier: "creator", currentPeriodEnd: null, cancelAtPeriodEnd: false },
		});
		expect(await checkout.json()).toEqual({
			url: "https://checkout.stripe.test/cs_1",
			sessionId: "cs_1",
		});
		expect(await portal.json()).toEqual({ url: "https://billing.stripe.test/bps_1" });
		expect(billing.checkoutUser).toBe("user-1");
		expect(billing.checkoutCadence).toBe("annual");
		expect(billing.portalUser).toBe("user-1");
	});

	it("rejects an unknown checkout cadence instead of selecting a price implicitly", async () => {
		const response = await appFor().request(
			new Request("http://localhost/api/billing/checkout", {
				method: "POST",
				headers: { cookie: "session=valid", "content-type": "application/json" },
				body: JSON.stringify({ cadence: "lifetime" }),
			}),
		);

		expect(response.status).toBe(400);
	});

	it("passes the untouched webhook body and signature without account auth", async () => {
		const billing = new FakeBilling();
		const app = appFor({ auth: { verify: async () => null }, billing });

		const response = await app.request(
			new Request("http://localhost/api/billing/webhook", {
				method: "POST",
				headers: { "stripe-signature": "sig_test" },
				body: '{ "spacing": "must stay exact" }',
			}),
		);

		expect(response.status).toBe(200);
		expect(billing.webhookInput).toEqual([
			'{ "spacing": "must stay exact" }',
			"sig_test",
		]);
	});

	it("rejects a missing or invalid signature but leaves transient failures retryable", async () => {
		const billing = new FakeBilling();
		const app = appFor({ billing });
		const missing = await app.request("http://localhost/api/billing/webhook", {
			method: "POST",
			body: "raw",
		});
		expect(missing.status).toBe(400);

		billing.webhookError = new InvalidBillingWebhookSignatureError();
		const invalid = await app.request("http://localhost/api/billing/webhook", {
			method: "POST",
			headers: { "stripe-signature": "bad" },
			body: "raw",
		});
		expect(invalid.status).toBe(400);

		billing.webhookError = new Error("database unavailable");
		const transient = await app.request("http://localhost/api/billing/webhook", {
			method: "POST",
			headers: { "stripe-signature": "valid" },
			body: "raw",
		});
		expect(transient.status).toBe(503);
		expect(await transient.json()).toEqual({ error: "Billing webhook is temporarily unavailable" });
	});

	it("returns the server's allowance sentence even when Stripe is not configured", async () => {
		const seen: Array<readonly [string, string]> = [];
		const app = new Hono().route(
			"/api/billing",
			createBillingRoute({
				auth: auth("user-7"),
				billing: null,
				subscriptions: { planFor: async () => Plan.free() },
				usage: {
					usageFor: async (ownerId, periodStart) => {
						seen.push([ownerId, periodStart.toISOString()]);
						return {
							cloudProjects: 2,
							mediaBytes: 12 * 1024 * 1024,
							hostedRenderMsThisMonth: 0,
							activeRenders: 0,
						};
					},
				},
				now: () => NOW,
			}),
		);

		const anonymous = await app.request("http://localhost/api/billing/allowance");
		const response = await app.request(accountRequest("/api/billing/allowance"));

		expect(anonymous.status).toBe(401);
		expect(response.status).toBe(200);
		expect(seen).toEqual([["user-7", "2026-08-01T00:00:00.000Z"]]);
		expect(await response.json()).toEqual({
			allowance: {
				plan: "free",
				sentence:
					"You are using 2 of 3 cloud projects and 12\u00a0MB of 100\u00a0MB of media; hosted renders come with Creator.",
				limits: {
					cloudProjects: 3,
					mediaBytes: 100 * 1024 * 1024,
					hostedRenderTime: 0,
					concurrentRenders: 0,
				},
				usage: {
					cloudProjects: 2,
					mediaBytes: 12 * 1024 * 1024,
					hostedRenderMsThisMonth: 0,
					activeRenders: 0,
				},
			},
		});
	});

	it("fails closed when billing is not configured", async () => {
		const app = new Hono().route(
			"/api/billing",
			createBillingRoute({ auth: auth(), billing: null, now: () => NOW }),
		);

		const response = await app.request(accountRequest("/api/billing/checkout", "POST"));

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "Hosted billing is not configured" });
	});
});
