import type { BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { StripeBillingAdapter } from "@/infrastructure/billing/stripe-billing.adapter";
import { create } from "zustand";

const billing: BillingPort = new StripeBillingAdapter();

interface PlanState {
	plan: Plan;
	isUpgrading: boolean;
	error: string | null;

	/** Load the persisted plan (hosted build only, see note below). */
	refresh: () => Promise<void>;
	/** Upgrade to Pro via the billing adapter (Stripe placeholder). */
	upgrade: () => Promise<void>;
	/** Return to Free, cancels the (placeholder) subscription. */
	downgrade: () => Promise<void>;
}

/**
 * Plan state for the app.
 *
 * The local OSS build runs on Plan.local() (everything unlocked) and never
 * calls refresh(), so nothing is ever gated: the export machinery reads this
 * plan and every entitlement check is a pass-through no-op. The refresh /
 * upgrade / downgrade actions and the billing adapter exist for the hosted
 * (cloud) build, where the plan becomes server-authoritative. The billing UI
 * (src/presentation/components/billing) ships unmounted today, pending the
 * hosted build that wires it in.
 */
export const usePlanStore = create<PlanState>((set) => ({
	plan: Plan.local(),
	isUpgrading: false,
	error: null,

	refresh: async () => {
		try {
			const plan = await billing.getCurrentPlan();
			set({ plan });
		} catch {
			set({ plan: Plan.free() });
		}
	},

	upgrade: async () => {
		set({ isUpgrading: true, error: null });
		try {
			// Production: redirect the browser to the returned Stripe Checkout URL.
			// Placeholder: the adapter completes checkout synchronously.
			await billing.startCheckout();
			const plan = await billing.getCurrentPlan();
			set({ plan, isUpgrading: false });
		} catch (err) {
			set({
				isUpgrading: false,
				error: err instanceof Error ? err.message : "Upgrade failed",
			});
		}
	},

	downgrade: async () => {
		await billing.cancelSubscription();
		const plan = await billing.getCurrentPlan();
		set({ plan });
	},
}));
