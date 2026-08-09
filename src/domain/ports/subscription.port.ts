/**
 * What an account is entitled to, resolved server-side.
 *
 * This port exists so that a plan is always *looked up* from an account and
 * never *asserted* by a caller. The hosted render endpoint used to read an
 * `x-typelapse-plan` header, which any client could set; routing every
 * entitlement through here makes that class of mistake impossible to express.
 *
 * Pure domain: no I/O, no framework.
 */

import type { Plan } from "../value-objects/plan";
import type { AccountId } from "./auth.port";

export interface SubscriptionPort {
	/**
	 * The plan currently in force for an account.
	 *
	 * Implementations return the free plan for an account with no paid
	 * subscription: absence of a subscription is a known answer, not an error.
	 */
	planFor(accountId: AccountId): Promise<Plan>;
}
