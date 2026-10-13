import { CheckoutReturnSheet } from "@/presentation/components/billing/checkout-return-sheet";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useBillingReturnStore } from "@/presentation/stores/billing-return.store";
import { isHostedBuild } from "@/presentation/stores/hosted-render-jobs.store";
import { notify } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { announceBillingReturn, takeBillingReturn } from "@/presentation/utils/billing-return";
import { useEffect } from "react";

/** The session is read by the account island once the studio is up; this waits for it, not forever. */
const SESSION_WAIT_MS = 10_000;

function sessionSettled(): Promise<boolean> {
	if (useAuthStore.getState().status.kind !== "checking") {
		return Promise.resolve(useAuthStore.getState().status.kind === "authenticated");
	}
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			unsubscribe();
			resolve(false);
		}, SESSION_WAIT_MS);
		const unsubscribe = useAuthStore.subscribe((state) => {
			if (state.status.kind !== "checking") {
				clearTimeout(timer);
				unsubscribe();
				resolve(state.status.kind === "authenticated");
			}
		});
	});
}

/**
 * What the studio says when checkout sends the person back to `/app`
 * (`announceBillingReturn` holds the rules). A cancelled checkout posts to the
 * notice host as any other exceptional message does; a successful one drives the
 * sheet this mounts (`CheckoutReturnSheet`), whose phase lives in a store.
 *
 * The parameter is taken once on mount, and the announcement runs outside the
 * effect's lifetime on purpose: StrictMode unmounts and remounts the effect, which
 * would cancel a poll that is still waiting for the provider's webhook. The poll is
 * bounded (20 seconds), and the store does not care that the studio moved on.
 * The plan is asked here rather than left to the account island, whose own refresh
 * runs when the session settles and can be before the webhook has landed.
 */
export function BillingReturnBoot() {
	useEffect(() => {
		const outcome = takeBillingReturn();
		if (!outcome) {
			return;
		}
		useBillingReturnStore.getState().reset();
		void announceBillingReturn(outcome, {
			hosted: isHostedBuild(),
			signedIn: sessionSettled,
			refreshPlan: async () => {
				await usePlanStore.getState().refresh({ signedIn: true });
				const { plan, notice } = usePlanStore.getState();
				// An account that had lapsed still carries its ended plan's notice until
				// the webhook lands: the one moment the sheet can know it came back.
				if (notice?.kind === "ended") {
					useBillingReturnStore.getState().markLapsed();
				}
				return plan;
			},
			notify: (message) => {
				notify(message);
			},
			phase: (next) => useBillingReturnStore.getState().show(next),
			wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		});
	}, []);

	return <CheckoutReturnSheet />;
}
