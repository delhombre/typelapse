import type { Plan } from "@/domain/value-objects/plan";

/**
 * The address checkout sends a person back to: `/app?billing=success` after a
 * payment, `/app?billing=cancelled` after leaving it (billing-service.ts builds
 * both). The studio had no view for either, so the return looked like a plain
 * reload with nothing said about the money.
 */

export type BillingReturn = "success" | "cancelled";

const PARAM = "billing";

/**
 * Read the parameter once and drop it in the same breath, as `takeImportIntent`
 * does for its hash: under StrictMode the mounting effect runs twice, and a
 * parameter that survived the first read would announce the return twice. Other
 * parameters and the hash stay, so a link carrying both still works. An unknown
 * value is scrubbed too, so it is not read on the next mount either.
 */
export function takeBillingReturn(): BillingReturn | null {
	const { pathname, search, hash } = window.location;
	const params = new URLSearchParams(search);
	const value = params.get(PARAM);
	if (value === null) {
		return null;
	}
	params.delete(PARAM);
	const rest = params.toString();
	window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}${hash}`);
	return value === "success" || value === "cancelled" ? value : null;
}

/** How often the plan is asked again after a payment the server has not confirmed yet. */
export const BILLING_RETRY_MS = 2_000;
/** How long that goes on before the studio says only that the payment arrived. */
export const BILLING_RETRY_WINDOW_MS = 20_000;

/** Where a return from a payment stands: asked, answered by the server, or given up on. */
export type BillingReturnPhase =
	| { readonly kind: "confirming" }
	| { readonly kind: "confirmed"; readonly plan: Plan }
	| { readonly kind: "timed-out" };

/** The words for a payment the server has not confirmed within the window. */
export const PAYMENT_RECEIVED = "Payment received.";
export const PLAN_UPDATES_SOON = "Your plan updates in a moment.";

export interface BillingReturnDeps {
	/** A hosted build: a local one has no plan to confirm. */
	readonly hosted: boolean;
	/** Whether the account is signed in, once its session has settled. */
	signedIn(): Promise<boolean>;
	/** Asks the server for the plan again and returns what it said. */
	refreshPlan(): Promise<Plan>;
	/** A toast, for what needs no surface of its own (a cancelled checkout). */
	notify(message: string): void;
	/** Moves the sheet that follows a successful payment from one phase to the next. */
	phase(next: BillingReturnPhase): void;
	/** Resolves after `ms`, or at once when `signal` aborts. */
	wait(ms: number): Promise<void>;
	/** Aborted when the studio goes away or the person signs out: the poll stops and says no more. */
	readonly signal: AbortSignal;
}

/**
 * What the studio says on the way back from checkout. It never announces a plan
 * the server has not confirmed: the provider's webhook can land after the person
 * does, so right after a payment the plan is still Free. When the first read
 * still says Free the sheet opens on "confirming" (a person who just paid is not
 * left looking at nothing; a webhook that already landed skips it, so nothing
 * flashes), the plan is asked again every BILLING_RETRY_MS for
 * BILLING_RETRY_WINDOW_MS, and the
 * sheet turns to "confirmed" the moment it is not Free; past that window it says
 * only what is known (the payment arrived), and the account island's own refresh
 * catches up. A cancelled checkout stays a toast. A local build, and a person who
 * is not signed in, hear nothing about a plan: the parameter is already gone.
 * The sheet opens only once the session has said who is there, so a signed-out
 * visitor never sees it flash.
 */
export async function announceBillingReturn(
	outcome: BillingReturn,
	deps: BillingReturnDeps,
): Promise<void> {
	if (!deps.hosted) {
		return;
	}
	if (outcome === "cancelled") {
		deps.notify("Checkout cancelled, nothing was charged.");
		return;
	}
	if (!(await deps.signedIn()) || deps.signal.aborted) {
		return;
	}
	const retries = BILLING_RETRY_WINDOW_MS / BILLING_RETRY_MS;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		if (attempt > 0) {
			await deps.wait(BILLING_RETRY_MS);
		}
		if (deps.signal.aborted) {
			return;
		}
		const plan = await deps.refreshPlan();
		if (deps.signal.aborted) {
			return;
		}
		if (!plan.isFree) {
			deps.phase({ kind: "confirmed", plan });
			return;
		}
		// Only now, with the first read still Free, is there something to wait for: a
		// webhook that had already landed goes straight to "confirmed", no flash.
		if (attempt === 0) {
			deps.phase({ kind: "confirming" });
		}
	}
	deps.phase({ kind: "timed-out" });
}
