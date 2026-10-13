import type { PlanAllowance, PlanAllowanceReader } from "@/application/billing/plan-allowance";
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
	/**
	 * Whether `plan` is the signed-in account's own, read from the server since the
	 * last sign-in. Until it is, a hosted account shows as Free; a surface that sells
	 * Creator waits for it rather than offering an upgrade to someone who has it.
	 */
	accountPlanKnown: boolean;
	/** The server's allowance sentence, shown verbatim; null when it has none. */
	allowance: string | null;
	/** The ceilings and usage that sentence was built from, for the plan card's meter; null without them. */
	allowanceDetail: PlanAllowance | null;
	/** The server's sentence for a payment that failed or a plan that ended; null when billing is in order. */
	notice: BillingNotice | null;
	cadence: BillingCadence;
	isUpgrading: boolean;
	error: string | null;
	selectCadence(cadence: BillingCadence): void;
	/** Signed out, only the public catalog is read: plan and allowance need an account. */
	refresh(options?: { readonly signedIn?: boolean }): Promise<void>;
	upgrade(cadence?: BillingCadence): Promise<void>;
	/**
	 * Frees Upgrade after the page left for checkout and came back with its state
	 * kept (the back-forward cache): nothing is on its way any more, and nothing failed.
	 */
	releaseCheckout(): void;
	manageBilling(): Promise<void>;
}

export interface PlanStoreOptions {
	readonly deploymentMode: ClientDeploymentMode;
	readonly billing?: BillingPort;
	/** Reads the allowance whole; the HTTP billing adapter does, by default. Without one only the sentence is known. */
	readonly allowanceReader?: PlanAllowanceReader;
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
	allowanceReader = billing instanceof HttpBillingAdapter ? billing : undefined,
	navigate = browserNavigate,
}: PlanStoreOptions) {
	interface AllowanceReading {
		readonly sentence: string;
		readonly detail: PlanAllowance | null;
	}
	/** Null when there is nothing to read (a server without an allowance, a build with no getter). */
	const readAllowance = async (): Promise<AllowanceReading | null> => {
		if (allowanceReader) {
			const detail = await allowanceReader.read();
			return { sentence: detail.sentence, detail };
		}
		const sentence = await (billing.getAllowance?.() ?? Promise.resolve(null));
		return sentence === null ? null : { sentence, detail: null };
	};

	// Asked once per page: billing does not switch on while the studio is open.
	let configured: Promise<boolean> | undefined;
	const billingConfigured = () => {
		// A probe that fails leaves billing assumed, as the adapter's does.
		configured ??= (billing.isConfigured?.() ?? Promise.resolve(true)).catch(() => true);
		return configured;
	};

	// Each read is numbered; only the latest one may write. A signed-out read that
	// answers after the signed-in one would otherwise leave the account's plan unknown.
	let reads = 0;

	return create<PlanState>((set, get) => ({
		plan: deploymentMode === "local" ? Plan.local() : Plan.free(),
		catalog: null,
		billingAvailable: false,
		accountPlanKnown: deploymentMode === "local",
		allowance: null,
		allowanceDetail: null,
		notice: null,
		cadence: "monthly",
		isUpgrading: false,
		error: null,
		selectCadence: (cadence) => set({ cadence }),

		refresh: async ({ signedIn = true } = {}) => {
			const read = ++reads;
			const latest = () => read === reads;
			if (deploymentMode === "local") {
				set({ plan: Plan.local(), error: null });
				return;
			}
			// A signed-out read says nothing about the next account: its plan is unknown
			// from the moment the visitor is a visitor again.
			if (!signedIn) set({ accountPlanKnown: false });
			const configured = await billingConfigured();
			if (!latest()) return;
			if (!configured) {
				// A hosted server without a payment provider answers the catalog, plan
				// and notice reads with a 503: nothing to ask, and Free is the whole
				// story. The allowance does not depend on checkout (a free account has
				// ceilings either way), so a signed-in account still reads it.
				const [allowance] = await Promise.allSettled([
					signedIn ? readAllowance() : Promise.resolve(null),
				]);
				if (!latest()) return;
				const reading = allowance.status === "fulfilled" ? allowance.value : null;
				set({
					catalog: null,
					billingAvailable: false,
					plan: Plan.free(),
					accountPlanKnown: signedIn,
					allowance: reading?.sentence ?? null,
					allowanceDetail: reading?.detail ?? null,
					notice: null,
					error: null,
				});
				return;
			}
			const [catalog, plan, allowance, notice] = await Promise.allSettled([
				billing.getCatalog(),
				signedIn ? billing.getCurrentPlan() : Promise.resolve(Plan.free()),
				signedIn ? readAllowance() : Promise.resolve(null),
				signedIn ? (billing.getNotice?.() ?? Promise.resolve(null)) : Promise.resolve(null),
			]);
			if (!latest()) return;
			const reading = allowance.status === "fulfilled" ? allowance.value : null;
			set({
				catalog: catalog.status === "fulfilled" ? catalog.value : null,
				billingAvailable: catalog.status === "fulfilled",
				plan: plan.status === "fulfilled" ? plan.value : Plan.free(),
				accountPlanKnown: signedIn,
				allowance: reading?.sentence ?? null,
				allowanceDetail: reading?.detail ?? null,
				notice: notice.status === "fulfilled" ? notice.value : null,
				error: null,
			});
		},

		upgrade: async (cadence) => {
			if (deploymentMode === "local") {
				set({ error: "Cloud billing is not part of this local deployment." });
				return;
			}
			// One checkout per press: a second press while the first is on its way waits on it.
			if (get().isUpgrading) return;
			set({ isUpgrading: true, error: null });
			try {
				const checkout = await billing.startCheckout(cadence ?? get().cadence);
				// Still busy: the page is leaving for the checkout, and a press between the
				// departure and the unload must not open a second session. Only a failure frees it.
				navigate(checkout.url);
			} catch (error) {
				set({
					isUpgrading: false,
					error: error instanceof Error ? error.message : "Upgrade failed",
				});
			}
		},

		releaseCheckout: () => set({ isUpgrading: false }),

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
