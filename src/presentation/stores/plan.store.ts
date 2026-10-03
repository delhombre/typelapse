import type { BillingCadence, BillingCatalog, BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { StripeBillingAdapter } from "@/infrastructure/billing/stripe-billing.adapter";
import { create } from "zustand";

export type ClientDeploymentMode = "local" | "hosted";

export interface PlanState {
	plan: Plan;
	catalog: BillingCatalog | null;
	billingAvailable: boolean;
	/** The server's allowance sentence, shown verbatim; null when it has none. */
	allowance: string | null;
	cadence: BillingCadence;
	isUpgrading: boolean;
	error: string | null;
	selectCadence(cadence: BillingCadence): void;
	refresh(): Promise<void>;
	upgrade(cadence?: BillingCadence): Promise<void>;
	manageBilling(): Promise<void>;
}

export interface PlanStoreOptions {
	readonly deploymentMode: ClientDeploymentMode;
	readonly billing?: BillingPort;
	readonly navigate?: (url: string) => void;
}

function browserNavigate(url: string): void {
	window.location.assign(url);
}

/**
 * Deployment and entitlement are intentionally separate. A local build is
 * fully unlocked and never calls Stripe; a hosted build starts Free and trusts
 * only the server projection after session refresh.
 */
export function createPlanStore({
	deploymentMode,
	billing = new StripeBillingAdapter(),
	navigate = browserNavigate,
}: PlanStoreOptions) {
	return create<PlanState>((set, get) => ({
		plan: deploymentMode === "local" ? Plan.local() : Plan.free(),
		catalog: null,
		billingAvailable: false,
		allowance: null,
		cadence: "monthly",
		isUpgrading: false,
		error: null,
		selectCadence: (cadence) => set({ cadence }),

		refresh: async () => {
			if (deploymentMode === "local") {
				set({ plan: Plan.local(), error: null });
				return;
			}
			const [catalog, plan, allowance] = await Promise.allSettled([
				billing.getCatalog(),
				billing.getCurrentPlan(),
				billing.getAllowance?.() ?? Promise.resolve(null),
			]);
			set({
				catalog: catalog.status === "fulfilled" ? catalog.value : null,
				billingAvailable: catalog.status === "fulfilled",
				plan: plan.status === "fulfilled" ? plan.value : Plan.free(),
				allowance: allowance.status === "fulfilled" ? allowance.value : null,
				error: null,
			});
		},

		upgrade: async (cadence) => {
			if (deploymentMode === "local") {
				set({ error: "Cloud billing is not part of this local deployment." });
				return;
			}
			set({ isUpgrading: true, error: null });
			try {
				const checkout = await billing.startCheckout(cadence ?? get().cadence);
				set({ isUpgrading: false });
				navigate(checkout.url);
			} catch (error) {
				set({
					isUpgrading: false,
					error: error instanceof Error ? error.message : "Upgrade failed",
				});
			}
		},

		manageBilling: async () => {
			if (deploymentMode === "local") {
				set({ error: "Cloud billing is not part of this local deployment." });
				return;
			}
			set({ error: null });
			try {
				const portal = await billing.openPortal();
				navigate(portal.url);
			} catch (error) {
				set({ error: error instanceof Error ? error.message : "Billing portal failed" });
			}
		},
	}));
}

const deploymentMode: ClientDeploymentMode =
	import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE === "hosted" ? "hosted" : "local";

export const usePlanStore = createPlanStore({ deploymentMode });
