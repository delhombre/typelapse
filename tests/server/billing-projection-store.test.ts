import { describe, expect, it } from "vitest";
import { billingProjectionFromRow } from "../../server/db/billing-projection.store";

const NOW = new Date("2026-08-30T20:00:00.000Z");

describe("billing projection persistence mapping", () => {
	it("returns a Stripe-backed Creator projection", () => {
		expect(
			billingProjectionFromRow({
				userId: "user-1",
				planTier: "creator",
				stripeStatus: "active",
				stripeCustomerId: "cus_1",
				stripeSubscriptionId: "sub_1",
				stripePriceId: "price_creator_monthly",
				currentPeriodEnd: NOW,
				cancelAtPeriodEnd: false,
				lastEventId: "evt_1",
				lastEventCreatedAt: NOW,
				createdAt: NOW,
				updatedAt: NOW,
			}),
		).toMatchObject({ userId: "user-1", planTier: "creator", stripeStatus: "active" });
	});

	it("fails closed for an unassociated default row", () => {
		expect(
			billingProjectionFromRow({
				userId: "user-1",
				planTier: "free",
				stripeStatus: "none",
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripePriceId: null,
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false,
				lastEventId: null,
				lastEventCreatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			}),
		).toBeNull();
	});
});
