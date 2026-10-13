import type { Plan } from "@/domain/value-objects/plan";

/**
 * Where the visitor stands with accounts: "none" when the build has no accounts
 * to offer (a local build, or a hosted one whose auth is not configured or not
 * answering), "checking" while the session is being read.
 */
export type CloudAccount = "none" | "checking" | "signed-out" | "signed-in";

/**
 * What Cloud under Where is for this visitor (ux-waves D3): not listed, listed
 * and asking to sign in, listed and offering Creator, or listed and chosen on a
 * press. The paid side is visible to everyone; it is gated only at the action.
 */
export type CloudGate = "absent" | "sign-in" | "upgrade" | "open";

export function cloudGate(input: {
	readonly hosted: boolean;
	readonly account: CloudAccount;
	readonly plan: Plan;
}): CloudGate {
	if (!input.hosted || input.account === "none") {
		return "absent";
	}
	if (input.account !== "signed-in") {
		return "sign-in";
	}
	// The server's projection decides the plan; a plan with no hosted render time
	// (Free) has somewhere to go, every other one renders.
	return input.plan.limitFor("hostedRenderTime") > 0 ? "open" : "upgrade";
}
