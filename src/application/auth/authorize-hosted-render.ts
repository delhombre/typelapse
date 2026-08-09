import { type AccountId, type AuthPort, isSessionActive } from "@/domain/ports/auth.port";
import type { SubscriptionPort } from "@/domain/ports/subscription.port";
import type { Plan } from "@/domain/value-objects/plan";

/**
 * Whether a caller may run a render on our infrastructure.
 *
 * Two refusals, kept distinct because they mean different things to the user
 * and map to different HTTP responses: `unauthenticated` means we do not know
 * who you are (sign in), `forbidden` means we know exactly who you are and
 * your plan does not include hosted rendering (upgrade).
 */
export type HostedRenderDecision =
	| { readonly outcome: "unauthenticated" }
	| { readonly outcome: "forbidden"; readonly plan: Plan }
	| {
			readonly outcome: "allowed";
			readonly accountId: AccountId;
			readonly plan: Plan;
	  };

export interface HostedRenderRequest {
	/** The opaque credential carried by the request, if any. */
	readonly credential: string | null;
	readonly auth: AuthPort;
	readonly subscriptions: SubscriptionPort;
	/** Passed in rather than read from the clock, so the decision is testable. */
	readonly now: Date;
}

export async function authorizeHostedRender({
	credential,
	auth,
	subscriptions,
	now,
}: HostedRenderRequest): Promise<HostedRenderDecision> {
	if (credential === null || credential === "") {
		return { outcome: "unauthenticated" };
	}

	const session = await auth.verify(credential);

	if (session === null || !isSessionActive(session, now)) {
		return { outcome: "unauthenticated" };
	}

	const plan = await subscriptions.planFor(session.accountId);

	if (!plan.capabilities.allowsCloudExport) {
		return { outcome: "forbidden", plan };
	}

	return { outcome: "allowed", accountId: session.accountId, plan };
}
