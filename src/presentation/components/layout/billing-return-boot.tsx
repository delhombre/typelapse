import { notify } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { takeBillingReturn } from "@/presentation/utils/billing-return";
import { useEffect } from "react";

/**
 * What the studio says when checkout sends the person back to `/app`. It posts
 * to the notice host as any other exceptional message does and owns no surface
 * of its own. After a payment the plan is asked again at once: the account
 * island refreshes it when the session settles, which can be before the
 * provider's webhook has landed.
 *
 * Renders nothing.
 */
export function BillingReturnBoot() {
	useEffect(() => {
		const outcome = takeBillingReturn();
		if (outcome === "success") {
			notify("Creator is on.");
			void usePlanStore.getState().refresh({ signedIn: true });
		} else if (outcome === "cancelled") {
			notify("Checkout cancelled, nothing was charged.");
		}
	}, []);

	return null;
}
