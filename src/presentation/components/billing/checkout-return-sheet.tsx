import { hostedOutputGraceDays } from "@/application/billing/plan-allowance";
import { Plan } from "@/domain/value-objects/plan";
import { feedback } from "@/presentation/haptics";
import { useBillingReturnStore } from "@/presentation/stores/billing-return.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import {
	type BillingReturnPhase,
	PAYMENT_RECEIVED,
	PLAN_UPDATES_SOON,
} from "@/presentation/utils/billing-return";
import { useId, useRef } from "react";
import { X } from "reicon-react";
import { StudioBottomSheet } from "../ui/studio-bottom-sheet";
import { TestModeLine } from "./test-mode-line";
import "./checkout-return-sheet.css";

/**
 * The sheet that answers a successful checkout (`?billing=success`), in place of
 * the toast it used to be: a person who just paid is told what changed and where
 * it is, not shown a line that fades. It is a dialog (the native one the other
 * sheets use, so focus is trapped, Escape closes and the page behind is inert).
 *
 * Three phases, one surface, driven by `announceBillingReturn`:
 * - confirming: the provider's webhook has not landed, so the plan is still Free;
 * - confirmed: the server says the plan is not Free, and the sheet says what is new;
 * - timed out: twenty seconds passed, so it says only that the payment arrived.
 *
 * Mounted by `BillingReturnBoot`; it draws nothing until a phase is set.
 */
export function CheckoutReturnSheet() {
	const phase = useBillingReturnStore((state) => state.phase);
	const lapsed = useBillingReturnStore((state) => state.lapsed);
	const dismiss = useBillingReturnStore((state) => state.dismiss);
	const allowance = usePlanStore((state) => state.allowance);
	const environment = usePlanStore((state) => state.catalog?.environment);
	const titleId = useId();
	// The words stay on screen while the sheet slides out.
	const shown = useRef<BillingReturnPhase | null>(phase);
	if (phase) {
		shown.current = phase;
	}
	const view = shown.current;

	function renderInTheCloud() {
		feedback("commit");
		useExportStore.getState().setTarget("cloud");
		dismiss();
	}

	return (
		<div className="studio-root sc-tokens">
			<StudioBottomSheet
				open={phase !== null}
				onClose={dismiss}
				labelledBy={titleId}
				className="checkout-return-sheet"
			>
				<header className="studio-sheet-header">
					<div>
						<h2 id={titleId}>{titleOf(view)}</h2>
					</div>
					<button type="button" onClick={dismiss} aria-label="Close">
						<X size={14} strokeWidth={1.7} aria-hidden="true" />
					</button>
				</header>
				<div className="checkout-return-body" aria-live="polite">
					{/* The sheet's title changes as the phase does, and a title is not read again
					    when its text changes: this says it in the live region. */}
					<p className="sr-only">{titleOf(view)}</p>
					{view?.kind === "confirming" ? (
						<p className="checkout-return-wait">
							<span className="checkout-return-pulse" aria-hidden="true" />
							This takes a few seconds. You do not need to do anything.
						</p>
					) : null}
					{view?.kind === "timed-out" ? <p>{PLAN_UPDATES_SOON}</p> : null}
					{view?.kind === "confirmed" ? (
						<>
							<ul className="checkout-return-changes">
								<li>Cloud is now under Where when you export.</li>
								{allowance ? <li>{allowance}</li> : null}
								{lapsed ? (
									<li>
										Your earlier renders no longer expire after {hostedOutputGraceDays(Plan.free())}{" "}
										days.
									</li>
								) : null}
							</ul>
							<TestModeLine environment={environment} />
							<button type="button" className="checkout-return-action" onClick={renderInTheCloud}>
								Render in the cloud
							</button>
						</>
					) : null}
				</div>
			</StudioBottomSheet>
		</div>
	);
}

function titleOf(view: BillingReturnPhase | null): string {
	if (view?.kind === "confirmed") {
		return `${view.plan.label} is on.`;
	}
	if (view?.kind === "timed-out") {
		return PAYMENT_RECEIVED;
	}
	return "Confirming your payment";
}
