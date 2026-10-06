import { describe, expect, it } from "vitest";
import { billingProjectionFromRow } from "../../server/db/billing-projection.store";

const NOW = new Date("2026-08-30T20:00:00.000Z");

describe("billing projection persistence mapping", () => {
	it("returns a Polar-backed Creator projection", () => {
		expect(
			billingProjectionFromRow({
				userId: "user-1",
				planTier: "creator",
				providerStatus: "active",
				providerCustomerId: "cus_1",
				providerSubscriptionId: "sub_1",
				providerProductId: "prod_creator_monthly",
				currentPeriodEnd: NOW,
				cancelAtPeriodEnd: false,
				lastEventId: "evt_1",
				lastEventCreatedAt: NOW,
				createdAt: NOW,
				updatedAt: NOW,
			}),
		).toMatchObject({ userId: "user-1", planTier: "creator", providerStatus: "active" });
	});

	it("fails closed for an unassociated default row", () => {
		expect(
			billingProjectionFromRow({
				userId: "user-1",
				planTier: "free",
				providerStatus: "none",
				providerCustomerId: null,
				providerSubscriptionId: null,
				providerProductId: null,
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
