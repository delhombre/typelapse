import type { Plan } from "../value-objects/plan";

/** A payment checkout session (Stripe Checkout in production). */
export interface CheckoutSession {
	/** URL to redirect the browser to. */
	url: string;
	/** Provider-side session identifier. */
	sessionId: string;
}

/**
 * Billing boundary. Implemented by an infrastructure adapter (Stripe).
 *
 * The domain only knows it can read the current plan and start or cancel a
 * subscription, never how payments actually happen.
 */
export interface BillingPort {
	/** Resolve the current plan for the user (defaults to Free). */
	getCurrentPlan(): Promise<Plan>;
	/** Begin an upgrade to Pro; returns a checkout session to redirect to. */
	startCheckout(): Promise<CheckoutSession>;
	/** Cancel the Pro subscription and return to Free. */
	cancelSubscription(): Promise<void>;
}
