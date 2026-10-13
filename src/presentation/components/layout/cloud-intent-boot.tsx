import { cloudIntentAction } from "@/application/billing/cloud-intent";
import { useCloudAccount, useCloudGate } from "@/presentation/components/controls/cloud-render";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderSheetStore } from "@/presentation/stores/hosted-render-sheet.store";
import { takeCloudIntent } from "@/presentation/utils/cloud-intent";
import { useEffect, useState } from "react";

/**
 * How long the intent waits for the session and the plan to be read before it
 * opens the sheet anyway. The sheet has words for both ("Checking account…",
 * "Checking your plan…"); a link that silently does nothing loses the person.
 */
export const CLOUD_INTENT_WAIT_MS = 10_000;

/**
 * Answers `/app#cloud` once the studio is up (CONTEXT.md, Cloud intent): the
 * hosted render sheet in the state the account is in, or Cloud chosen where the
 * plan renders there. It waits for the session and the plan to be read, so a
 * Creator is never shown the signed-out offer for the few hundred ms the session
 * takes, and it opens the stage's sheet, which is mounted with the frame on every
 * shell and has no opener: when it closes, focus falls back to the island's
 * Export trigger. Like `ImportIntentBoot`, it follows a hash that changes on a
 * studio already open. Renders nothing.
 */
export function CloudIntentBoot() {
	const [taken, setTaken] = useState(false);
	const [gaveUp, setGaveUp] = useState(false);
	const gate = useCloudGate();
	const account = useCloudAccount();

	useEffect(() => {
		// takeCloudIntent consumes: StrictMode's second mount finds nothing, and the
		// state it set survives the remount.
		const take = () => {
			if (takeCloudIntent()) {
				setTaken(true);
			}
		};
		take();
		window.addEventListener("hashchange", take);
		return () => window.removeEventListener("hashchange", take);
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
		if (action === null || action === "wait") {
			return;
		}
		// No opener: nothing was pressed, and the sheet's own fallback finds the way back.
		if (action === "open-sheet") {
			useHostedRenderSheetStore.getState().show("stage", null);
		} else if (action === "choose-cloud") {
			useExportStore.getState().setTarget("cloud");
		}
		setTaken(false);
		setGaveUp(false);
	}, [action]);

	return null;
}
