import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import { Plan } from "../../src/domain/value-objects/plan";
import type { BillingProjectionStore } from "./billing-service";

/**
 * Entitlement read straight from the durable Stripe projection.
 *
 * Only signed webhooks write the projection, so reading it does not need the
 * Stripe gateway to be configured: with no Stripe, no row exists and every
 * account is free, which is the fail-closed answer the quotas need.
 */
export function createAccountPlanResolver(
	store: Pick<BillingProjectionStore, "findByUserId">,
): Required<SubscriptionPort> {
	return {
		async planFor(accountId) {
			const projection = await store.findByUserId(accountId);
			return projection?.planTier === "creator" ? Plan.pro() : Plan.free();
		},
		async downgradedAt(accountId) {
			const projection = await store.findByUserId(accountId);
			// A free projection only exists for an account that once subscribed; the
			// event that wrote it is the moment it lost the paid plan.
			return projection?.planTier === "free" ? projection.lastEventCreatedAt : null;
		},
	};
}
