// Relative rather than aliased: the Hono server imports this under tsx, which
// does not resolve the "@/" path mapping at runtime.
import type { BillingNotice } from "../../domain/ports/billing.port";
import { Plan } from "../../domain/value-objects/plan";

export interface BillingNoticeInput {
	readonly tier: "free" | "creator";
	/** The provider's subscription status, or "none" for an account that never subscribed. */
	readonly status: string;
	/** When the billing event that moved the account to this state arrived. */
	readonly since: Date | null;
	readonly now: Date;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

/**
 * The one sentence the account island owes an account whose billing is not in
 * order: a payment that failed, or a plan that ended with past renders still in
 * their grace period (viability D4: 30 days from the downgrade). Built on the
 * server, like the allowance, so the client never computes a date of its own.
 */
export function billingNotice({
	tier,
	status,
	since,
	now,
}: BillingNoticeInput): BillingNotice | null {
	if (tier === "creator" || since === null) {
		return null;
	}
	const graceEndsAt = new Date(since.getTime() + Plan.free().capabilities.hostedOutputGraceMs);
	const inGrace = now.getTime() < graceEndsAt.getTime();
	const keeps = `past renders stay downloadable until ${DATE.format(graceEndsAt)}`;
	if (status === "past_due" || status === "unpaid") {
		const fix =
			"Your last payment failed and Creator is paused; update your card in Manage billing";
		return { kind: "past-due", sentence: inGrace ? `${fix}, and ${keeps}.` : `${fix}.` };
	}
	if (status === "canceled" && inGrace) {
		return { kind: "ended", sentence: `Your Creator plan has ended; ${keeps}.` };
	}
	return null;
}
