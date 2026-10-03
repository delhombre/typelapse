import type { Plan } from "../value-objects/plan";

export type BillingCadence = "monthly" | "annual";

export interface BillingPrice {
	/** ISO 4217 currency code, normalized to uppercase. */
	readonly currency: string;
	/** Amount in the currency's smallest unit (for example cents). */
	readonly unitAmount: number;
}

export interface BillingCatalog {
	readonly creator: Readonly<Partial<Record<BillingCadence, BillingPrice>>>;
}

/** A payment checkout session (Stripe Checkout in production). */
export interface CheckoutSession {
	/** URL to redirect the browser to. */
	url: string;
	/** Provider-side session identifier. */
	sessionId: string;
}

export interface BillingPortalSession {
	/** Stripe-hosted, short-lived customer portal URL. */
	url: string;
}

/**
 * Billing boundary. Implemented by an infrastructure adapter (Stripe).
 *
 * The domain only knows it can read the current plan and start or cancel a
 * subscription, never how payments actually happen.
 */
export interface BillingPort {
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
}
