import type { BillingPort, CheckoutSession } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";

const STORAGE_KEY = "typelapse:plan";

function readTier(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "free";
	} catch {
		return "free";
	}
}

function writeTier(tier: "free" | "pro"): void {
	try {
		localStorage.setItem(STORAGE_KEY, tier);
	} catch {
		// non-persistent environments (SSR, private mode): ignore
	}
}

/**
 * Placeholder Stripe billing adapter.
 *
 * Production flow:
 *   1. `startCheckout()` -> `POST /api/billing/checkout` creates a Stripe
 *      Checkout Session; the browser is redirected to `session.url`.
 *   2. Stripe fires `checkout.session.completed` -> `POST /api/billing/webhook`
 *      flips the customer to Pro server-side.
 *   3. `getCurrentPlan()` reads the plan from the authenticated session.
 *
 * Until that infra exists this adapter persists the tier in localStorage and
 * simulates a completed checkout, so the gating can be exercised end-to-end
 * without real payments. Everything payment-related is intentionally stubbed.
 */
export class StripeBillingAdapter implements BillingPort {
	async getCurrentPlan(): Promise<Plan> {
		return Plan.fromTier(readTier());
	}

	async startCheckout(): Promise<CheckoutSession> {
		let session: CheckoutSession = { url: "#", sessionId: "placeholder" };
		try {
			const res = await fetch("/api/billing/checkout", { method: "POST" });
			if (res.ok) {
				const data = (await res.json()) as Partial<CheckoutSession>;
				session = {
					url: data.url ?? "#",
					sessionId: data.sessionId ?? "placeholder",
				};
			}
		} catch {
			// server stub unavailable: still simulate the upgrade below
		}
		// Placeholder: no real Stripe redirect/webhook yet, so complete locally.
		writeTier("pro");
		return session;
	}

	async cancelSubscription(): Promise<void> {
		writeTier("free");
	}
}
