import type {
	BillingCadence,
	BillingCatalog,
	BillingNotice,
	BillingPort,
} from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { HttpBillingAdapter } from "@/infrastructure/billing/http-billing.adapter";
import { create } from "zustand";

export type ClientDeploymentMode = "local" | "hosted";

export interface PlanState {
	plan: Plan;
	catalog: BillingCatalog | null;
	billingAvailable: boolean;
	/** The server's allowance sentence, shown verbatim; null when it has none. */
	allowance: string | null;
	/** The server's sentence for a payment that failed or a plan that ended; null when billing is in order. */
	notice: BillingNotice | null;
	cadence: BillingCadence;
	isUpgrading: boolean;
	error: string | null;
	selectCadence(cadence: BillingCadence): void;
	/** Signed out, only the public catalog is read: plan and allowance need an account. */
	refresh(options?: { readonly signedIn?: boolean }): Promise<void>;
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
 * fully unlocked and never calls billing; a hosted build starts Free and trusts
 * only the server projection after session refresh.
 */
export function createPlanStore({
	deploymentMode,
	billing = new HttpBillingAdapter(),
	navigate = browserNavigate,
}: PlanStoreOptions) {
	// Asked once per page: billing does not switch on while the studio is open.
	let configured: Promise<boolean> | undefined;
	const billingConfigured = () => {
		// A probe that fails leaves billing assumed, as the adapter's does.
		configured ??= (billing.isConfigured?.() ?? Promise.resolve(true)).catch(() => true);
		return configured;
	};

	return create<PlanState>((set, get) => ({
		plan: deploymentMode === "local" ? Plan.local() : Plan.free(),
		catalog: null,
		billingAvailable: false,
		allowance: null,
		notice: null,
		cadence: "monthly",
		isUpgrading: false,
		error: null,
		selectCadence: (cadence) => set({ cadence }),

		refresh: async ({ signedIn = true } = {}) => {
			if (deploymentMode === "local") {
				set({ plan: Plan.local(), error: null });
				return;
			}
			if (!(await billingConfigured())) {
				// A hosted server without a payment provider answers the catalog, plan
				// and notice reads with a 503: nothing to ask, and Free is the whole
				// story. The allowance does not depend on checkout (a free account has
				// ceilings either way), so a signed-in account still reads it.
				const [allowance] = await Promise.allSettled([
					signedIn ? (billing.getAllowance?.() ?? Promise.resolve(null)) : Promise.resolve(null),
				]);
				set({
					catalog: null,
					billingAvailable: false,
					plan: Plan.free(),
					allowance: allowance.status === "fulfilled" ? allowance.value : null,
					notice: null,
					error: null,
				});
				return;
			}
			const [catalog, plan, allowance, notice] = await Promise.allSettled([
				billing.getCatalog(),
				signedIn ? billing.getCurrentPlan() : Promise.resolve(Plan.free()),
				signedIn ? (billing.getAllowance?.() ?? Promise.resolve(null)) : Promise.resolve(null),
				signedIn ? (billing.getNotice?.() ?? Promise.resolve(null)) : Promise.resolve(null),
			]);
			set({
				catalog: catalog.status === "fulfilled" ? catalog.value : null,
				billingAvailable: catalog.status === "fulfilled",
				plan: plan.status === "fulfilled" ? plan.value : Plan.free(),
				allowance: allowance.status === "fulfilled" ? allowance.value : null,
				notice: notice.status === "fulfilled" ? notice.value : null,
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
