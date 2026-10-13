import type { CloudAccount, CloudGate } from "@/application/billing/cloud-gate";

/**
 * The studio's deep link to Typelapse Cloud: `/app#cloud`. The pricing page and the
 * mails link to it; the studio reads it once on arrival, as it reads `#import=` and
 * `#share=`, and answers in the state the account is in.
 */
export const CLOUD_HASH = "#cloud";

/** Where a link to the Cloud intent points. */
export const CLOUD_INTENT_PATH = `/app${CLOUD_HASH}`;

/** What a hash asks of the studio, or null when it asks nothing of this reader. */
export function cloudIntentFrom(hash: string): "cloud" | null {
	return hash === CLOUD_HASH ? "cloud" : null;
}

/**
 * What the studio does with the intent, from what Cloud under Where is for this
 * visitor (`cloudGate`): the sheet that explains it (signed out: the gains and
 * Sign in; Free: the allowance and Upgrade), Cloud chosen for a plan that renders
 * there, nothing where there is no Cloud, or "wait" while the session or the plan
 * is still being read: the gate says "sign-in" for a session not read yet, and
 * answering then would offer Sign in to someone who is about to be found signed in.
 */
export function cloudIntentAction(input: {
	readonly gate: CloudGate;
	readonly account: CloudAccount;
}): "open-sheet" | "choose-cloud" | "wait" | "none" {
	const { gate, account } = input;
	if (gate === "absent") {
		return "none";
	}
	if (gate === "pending" || account === "checking") {
		return "wait";
	}
	return gate === "open" ? "choose-cloud" : "open-sheet";
}
