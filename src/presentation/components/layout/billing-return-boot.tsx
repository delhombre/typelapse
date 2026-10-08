import { useAuthStore } from "@/presentation/stores/auth.store";
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
 * (`announceBillingReturn` holds the rules). It posts to the notice host as any
 * other exceptional message does and owns no surface of its own.
 *
 * The parameter is taken once on mount, and the announcement runs outside the
 * effect's lifetime on purpose: StrictMode unmounts and remounts the effect, which
 * would cancel a poll that is still waiting for the provider's webhook. The poll is
 * bounded (20 seconds), and the notice host does not care that the studio moved on.
 * The plan is asked here rather than left to the account island, whose own refresh
 * runs when the session settles and can be before the webhook has landed.
 *
 * Renders nothing.
 */
export function BillingReturnBoot() {
	useEffect(() => {
		const outcome = takeBillingReturn();
		if (!outcome) {
			return;
		}
		void announceBillingReturn(outcome, {
			hosted: isHostedBuild(),
			signedIn: sessionSettled,
			refreshPlan: async () => {
				await usePlanStore.getState().refresh({ signedIn: true });
				return usePlanStore.getState().plan;
			},
			notify: (message) => {
				notify(message);
			},
			wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		});
	}, []);

	return null;
}
