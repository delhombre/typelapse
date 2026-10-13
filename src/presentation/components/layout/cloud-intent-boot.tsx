import { cloudIntentAction } from "@/application/billing/cloud-intent";
import { useCloudAccount, useCloudGate } from "@/presentation/components/controls/cloud-render";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderSheetStore } from "@/presentation/stores/hosted-render-sheet.store";
import { notify } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { takeCloudIntent } from "@/presentation/utils/cloud-intent";
import { useEffect, useRef, useState } from "react";

/**
 * How long the intent waits for the session and the plan to be read before it
 * opens the sheet anyway. The sheet has words for both ("Checking account…",
 * "Checking your plan…"); a link that silently does nothing loses the person.
 */
export const CLOUD_INTENT_WAIT_MS = 10_000;

/** What a Creator is told when the link has chosen Cloud for them: no sheet opens, so nothing else says so. */
export const CLOUD_CHOSEN_NOTICE = "Cloud is selected under Where";

/**
 * Answers `/app#cloud` once the studio is up (CONTEXT.md, Cloud intent): the
 * hosted render sheet in the state the account is in, or Cloud chosen where the
 * plan renders there. It waits for the session and the plan to be read, so a
 * Creator is never shown the signed-out offer for the few hundred ms the session
 * takes, and it opens the stage's sheet, which is mounted with the frame on every
 * shell and has no opener: when it closes, focus falls back to the island's
 * Export trigger. Like `ImportIntentBoot`, it follows a hash that changes on a
 * studio already open, after asking the server for the plan again: the one in memory may be
 * older than an upgrade made in another tab. A sheet the person already opened (Cloud under
 * Where, pressed while the intent waited) is left as it is, with its opener. Renders nothing.
 */
export function CloudIntentBoot() {
	const [taken, setTaken] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const gate = useCloudGate();
	const account = useCloudAccount();

	// One answer per intent, whatever StrictMode does to the effect that gives it.
	const answered = useRef(false);

	useEffect(() => {
		// takeCloudIntent consumes: StrictMode's second mount finds nothing, and the
		// state it set survives the remount.
		const arrive = () => {
			if (takeCloudIntent()) {
				answered.current = false;
				setTaken(true);
			}
		};
		// A studio already open holds the plan it read when it opened. A signed-in account
		// that upgraded elsewhere since would be offered Upgrade again, so ask once more.
		// The hash is scrubbed before the await, as on arrival.
		const follow = async () => {
			if (!takeCloudIntent()) {
				return;
			}
			if (
				useAuthStore.getState().status.kind === "authenticated" &&
				usePlanStore.getState().accountPlanKnown
			) {
				await usePlanStore.getState().refresh({ signedIn: true });
			}
			answered.current = false;
			setTaken(true);
		};
		arrive();
		const onHashChange = () => void follow();
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	const answer = taken ? cloudIntentAction({ gate, account }) : null;
	const waiting = answer === "wait";
	const action = waiting && gaveUp ? "open-sheet" : answer;

	useEffect(() => {
		if (!waiting) {
			return;
		}
		const timer = setTimeout(() => setGaveUp(true), CLOUD_INTENT_WAIT_MS);
		return () => clearTimeout(timer);
	}, [waiting]);

	useEffect(() => {
		if (action === null || action === "wait" || answered.current) {
			return;
		}
		answered.current = true;
		if (action === "open-sheet") {
			// Someone pressed Cloud under Where while this waited: that sheet has its opener.
			if (useHostedRenderSheetStore.getState().openFor === null) {
				// No opener: nothing was pressed, and the sheet's own fallback finds the way back.
				useHostedRenderSheetStore.getState().show("stage", null);
			}
		} else if (action === "choose-cloud") {
			useExportStore.getState().setTarget("cloud");
			notify(CLOUD_CHOSEN_NOTICE);
		}
		setTaken(false);
		setGaveUp(false);
	}, [action]);

	return null;
}
