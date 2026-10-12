import type { Plan } from "../value-objects/plan";

export type BillingCadence = "monthly" | "annual";

export interface BillingPrice {
	/** ISO 4217 currency code, normalized to uppercase. */
	readonly currency: string;
	/** Amount in the currency's smallest unit (for example cents). */
	readonly unitAmount: number;
}

/** Which payment provider the server is wired to: "sandbox" charges nobody. */
export type BillingEnvironment = "sandbox" | "production";

export interface BillingCatalog {
	/**
	 * Read from the server's own configuration, never guessed from the build.
	 * Absent (an older server) counts as production: the test-mode line stays off.
	 */
	readonly environment?: BillingEnvironment;
	readonly creator: Readonly<Partial<Record<BillingCadence, BillingPrice>>>;
}

/** Billing that is not in order: one sentence, and whether a card or a new plan is the fix. */
export interface BillingNotice {
	readonly kind: "past-due" | "ended";
	readonly sentence: string;
}

/** A payment checkout session (Polar's hosted checkout in production). */
export interface CheckoutSession {
	/** URL to redirect the browser to. */
	url: string;
	/** Provider-side session identifier. */
	sessionId: string;
}

export interface BillingPortalSession {
	/** Provider-hosted, short-lived customer portal URL. */
	url: string;
}

/**
 * Billing boundary. Implemented by an infrastructure adapter over the server's billing API.
 *
 * The domain only knows it can read the current plan and start or cancel a
 * subscription, never how payments actually happen.
 */
export interface BillingPort {
	/**
	 * Whether the server has billing configured at all. A hosted server without a
	 * payment provider answers every billing read with a 503, so the client asks
	 * once instead of probing. Absent, billing is assumed to be there.
	 */
	isConfigured?(): Promise<boolean>;
	/** Public, provider-authoritative prices currently configured for sale. */
	getCatalog(): Promise<BillingCatalog>;
	/** Resolve the current plan for the user (defaults to Free). */
	getCurrentPlan(): Promise<Plan>;
	/** Begin an upgrade to Creator; returns a checkout session to redirect to. */
	startCheckout(cadence: BillingCadence): Promise<CheckoutSession>;
	/** Open the provider portal for cancellation, invoices and payment methods. */
	openPortal(): Promise<BillingPortalSession>;
	/**
	 * The server's one-sentence account allowance (ceilings and usage). The
	 * client shows it verbatim and never computes a number of its own.
	 */
	getAllowance?(): Promise<string>;
	/**
	 * The server's one sentence about billing that is not in order (a failed
	 * payment, a plan that ended), or null. Shown verbatim, like the allowance.
	 */
	getNotice?(): Promise<BillingNotice | null>;
}
