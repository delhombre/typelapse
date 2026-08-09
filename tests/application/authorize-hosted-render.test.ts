import { authorizeHostedRender } from "@/application/auth/authorize-hosted-render";
import type { AuthPort, AuthenticatedSession } from "@/domain/ports/auth.port";
import type { SubscriptionPort } from "@/domain/ports/subscription.port";
import { Plan } from "@/domain/value-objects/plan";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const LATER = new Date("2026-08-09T13:00:00.000Z");
const EARLIER = new Date("2026-08-09T11:00:00.000Z");

const sessionFor = (accountId: string, expiresAt: Date): AuthenticatedSession => ({
	accountId,
	expiresAt,
});

const authThatAccepts = (session: AuthenticatedSession): AuthPort => ({
	verify: async () => session,
});

const authThatRejects = (): AuthPort => ({
	verify: async () => null,
});

const subscribedTo = (plan: Plan): SubscriptionPort => ({
	planFor: async () => plan,
});

describe("authorizing a hosted render", () => {
	it("turns a missing credential away without asking the auth provider", async () => {
		let asked = false;
		const auth: AuthPort = {
			verify: async () => {
				asked = true;
				return null;
			},
		};

		const decision = await authorizeHostedRender({
			credential: null,
			auth,
			subscriptions: subscribedTo(Plan.pro()),
			now: NOW,
		});

		expect(decision.outcome).toBe("unauthenticated");
		expect(asked).toBe(false);
	});

	it("turns away a credential the provider does not recognise", async () => {
		const decision = await authorizeHostedRender({
			credential: "forged",
			auth: authThatRejects(),
			subscriptions: subscribedTo(Plan.pro()),
			now: NOW,
		});

		expect(decision.outcome).toBe("unauthenticated");
	});

	it("treats an expired session as no session at all", async () => {
		const decision = await authorizeHostedRender({
			credential: "stale",
			auth: authThatAccepts(sessionFor("acc_1", EARLIER)),
			subscriptions: subscribedTo(Plan.pro()),
			now: NOW,
		});

		expect(decision.outcome).toBe("unauthenticated");
	});

	it("refuses an authenticated account whose plan has no hosted export", async () => {
		const decision = await authorizeHostedRender({
			credential: "valid",
			auth: authThatAccepts(sessionFor("acc_1", LATER)),
			subscriptions: subscribedTo(Plan.free()),
			now: NOW,
		});

		expect(decision.outcome).toBe("forbidden");
	});

	it("refuses the local plan, which renders on the user's own machine", async () => {
		const decision = await authorizeHostedRender({
			credential: "valid",
			auth: authThatAccepts(sessionFor("acc_1", LATER)),
			subscriptions: subscribedTo(Plan.local()),
			now: NOW,
		});

		expect(decision.outcome).toBe("forbidden");
	});

	it("allows an authenticated account on a plan that includes hosted export", async () => {
		const decision = await authorizeHostedRender({
			credential: "valid",
			auth: authThatAccepts(sessionFor("acc_42", LATER)),
			subscriptions: subscribedTo(Plan.pro()),
			now: NOW,
		});

		expect(decision).toEqual({
			outcome: "allowed",
			accountId: "acc_42",
			plan: Plan.pro(),
		});
	});

	it("resolves the plan from the account, never from the caller", async () => {
		let askedFor = "";
		const subscriptions: SubscriptionPort = {
			planFor: async (accountId) => {
				askedFor = accountId;
				return Plan.pro();
			},
		};

		await authorizeHostedRender({
			credential: "valid",
			auth: authThatAccepts(sessionFor("acc_7", LATER)),
			subscriptions,
			now: NOW,
		});

		expect(askedFor).toBe("acc_7");
	});
});
