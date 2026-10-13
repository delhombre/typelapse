import { CheckoutReturnSheet } from "@/presentation/components/billing/checkout-return-sheet";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useBillingReturnStore } from "@/presentation/stores/billing-return.store";
import { isHostedBuild } from "@/presentation/stores/hosted-render-jobs.store";
import { notify } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import {
	type BillingReturn,
	announceBillingReturn,
	takeBillingReturn,
} from "@/presentation/utils/billing-return";
import { useEffect, useRef } from "react";

/** The session is read by the account island once the studio is up; this waits for it, not forever. */
const SESSION_WAIT_MS = 10_000;

/** Resolves after `ms`, or at once when `signal` aborts, with its timer cleared either way. */
function abortableWait(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		signal.addEventListener("abort", finish, { once: true });
	});
}

function sessionSettled(signal: AbortSignal): Promise<boolean> {
	if (useAuthStore.getState().status.kind !== "checking") {
		return Promise.resolve(useAuthStore.getState().status.kind === "authenticated");
	}
	return new Promise((resolve) => {
		const settle = (answer: boolean) => {
			clearTimeout(timer);
			unsubscribe();
			signal.removeEventListener("abort", onAbort);
			resolve(answer);
		};
		const onAbort = () => settle(false);
		const timer = setTimeout(() => settle(false), SESSION_WAIT_MS);
		const unsubscribe = useAuthStore.subscribe((state) => {
			if (state.status.kind !== "checking") {
				settle(state.status.kind === "authenticated");
			}
		});
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

/** The return that began last: the only one whose stop may close the sheet. */
let latest: AbortController | null = null;

interface BillingReturnRun {
	/** Lets a stop that is waiting for its turn lapse: the effect came straight back (StrictMode). */
	keep(): void;
	/** Stops the poll and closes the sheet, unless `keep` follows at once. */
	release(): void;
}

/**
 * One return from checkout, from the moment the parameter is read to the moment
 * the sheet has its answer. It owns an AbortController: aborting it clears the
 * pending timer, stops the next ask and closes the sheet, so nothing keeps
 * polling for a studio that has gone away or an account that has signed out.
 */
function startBillingReturn(outcome: BillingReturn): BillingReturnRun {
	const controller = new AbortController();
	const { signal } = controller;
	const returns = useBillingReturnStore.getState();
	returns.reset();
	// A sign-out mid-poll ends it: the plan is no longer the signed-in person's to confirm.
	// Only a real "anonymous" counts: a session read that failed for a moment
	// ("hosted-unavailable") or is being read again ("checking") is not a sign-out.
	const unsubscribe = useAuthStore.subscribe((state) => {
		if (state.status.kind === "anonymous") {
			controller.abort();
		}
	});
	latest = controller;
	signal.addEventListener(
		"abort",
		() => {
			unsubscribe();
			// A stop that arrives after a newer return began must not close that one's sheet.
			if (latest === controller) {
				useBillingReturnStore.getState().dismiss();
			}
		},
		{ once: true },
	);
	void announceBillingReturn(outcome, {
		hosted: isHostedBuild(),
		signedIn: () => sessionSettled(signal),
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
		wait: (ms) => abortableWait(ms, signal),
		signal,
	}).then(unsubscribe, unsubscribe);

	let pendingStop: ReturnType<typeof setTimeout> | undefined;
	return {
		keep: () => clearTimeout(pendingStop),
		release: () => {
			pendingStop = setTimeout(() => controller.abort(), 0);
		},
	};
}

/**
 * What the studio says when checkout sends the person back to `/app`
 * (`announceBillingReturn` holds the rules). A cancelled checkout posts to the
 * notice host as any other exceptional message does; a successful one drives the
 * sheet this mounts (`CheckoutReturnSheet`), whose phase lives in a store.
 *
 * The parameter is taken once, by the first effect run of this instance. StrictMode
 * unmounts and remounts the effect at once, which must not cancel a poll that is
 * still waiting for the provider's webhook: the stop is queued for the next task
 * and the remount lets it lapse (the run lives in a ref, which StrictMode keeps).
 * A real unmount, or a sign-out, stops the poll for good; either way it ends within
 * 20 seconds. The plan is asked here rather than left to the account island, whose
 * own refresh runs when the session settles and can be before the webhook has landed.
 */
export function BillingReturnBoot() {
	const run = useRef<BillingReturnRun | null>(null);
	// Back from checkout through the back-forward cache, the studio comes back with
	// Upgrade still "Opening secure checkout…" (the store keeps it busy while the page
	// leaves): a restored page frees it. A fresh load starts free anyway.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) {
				usePlanStore.getState().releaseCheckout();
			}
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, []);
	useEffect(() => {
		if (!run.current) {
			const outcome = takeBillingReturn();
			if (!outcome) {
				return;
			}
			run.current = startBillingReturn(outcome);
		}
		const current = run.current;
		current.keep();
		return () => current.release();
	}, []);

	return <CheckoutReturnSheet />;
}
