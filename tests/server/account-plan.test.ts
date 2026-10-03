import { describe, expect, it } from "vitest";
import { createAccountPlanResolver } from "../../server/billing/account-plan";
import type { BillingProjection } from "../../server/billing/billing-service";

const EVENT_AT = new Date("2026-09-20T10:00:00.000Z");

function projection(planTier: "free" | "creator"): BillingProjection {
	return {
		userId: "user-1",
		planTier,
		stripeStatus: planTier === "creator" ? "active" : "canceled",
		stripeCustomerId: "cus_1",
		stripeSubscriptionId: "sub_1",
		stripePriceId: "price_1",
		currentPeriodEnd: new Date("2026-10-20T10:00:00.000Z"),
		cancelAtPeriodEnd: false,
		lastEventId: "evt_1",
		lastEventCreatedAt: EVENT_AT,
	};
}

const resolverWith = (row: BillingProjection | null) =>
	createAccountPlanResolver({ findByUserId: async () => row });

describe("account plan from the durable projection", () => {
	it("is free with no projection and reports no downgrade", async () => {
		const resolver = resolverWith(null);
		expect((await resolver.planFor("user-1")).tier).toBe("free");
		expect(await resolver.downgradedAt?.("user-1")).toBeNull();
	});

	it("is Creator while the projection says creator", async () => {
		const resolver = resolverWith(projection("creator"));
		expect((await resolver.planFor("user-1")).tier).toBe("pro");
		expect(await resolver.downgradedAt?.("user-1")).toBeNull();
	});

	it("dates the downgrade from the event that put the account back on free", async () => {
		const resolver = resolverWith(projection("free"));
		expect((await resolver.planFor("user-1")).tier).toBe("free");
		expect(await resolver.downgradedAt?.("user-1")).toEqual(EVENT_AT);
	});
});
