import type { PlanAllowance } from "@/application/billing/plan-allowance";
import { priceLabel } from "@/application/billing/price-label";
import { type QuotaMeter, nearAnyLimit, quotaMeters } from "@/application/billing/quota-meter";
import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import { TestModeLine } from "../billing/test-mode-line";
import { PlanMeter } from "./plan-meter";
import "./studio-account-control.css";

export interface StudioBillingControl {
	readonly planLabel: string;
	readonly paid: boolean;
	readonly available: boolean;
	readonly catalog: BillingCatalog | null;
	readonly cadence: BillingCadence;
	readonly busy: boolean;
	readonly error: string | null;
	/** Billing that is not in order, in the server's words; null when it is. */
	readonly notice?: BillingNotice | null;
	readonly onCadence: (cadence: BillingCadence) => void;
	readonly onUpgrade: () => void;
	readonly onManageBilling: () => void;
}

/**
 * The account sheet's Plan tab: what the plan allows and how much of it is used,
 * the one way to change it, and the way out to the public pages. With the ceilings
 * and usage in hand the allowance is a meter, inside the plan card when billing is
 * offered; the server's sentence alone is the fallback (an older server, a build
 * with no billing) and the screen reader's own summary.
 */
export function AccountPlan({
	billing,
	allowance,
	allowanceDetail,
}: {
	readonly billing?: StudioBillingControl;
	/** The server's allowance sentence, shown as written; the client holds no numbers. */
	readonly allowance?: string | null;
	/** The ceilings and usage behind that sentence: with them the plan card draws a meter per quota. */
	readonly allowanceDetail?: PlanAllowance | null;
}) {
	const meters = allowanceDetail ? quotaMeters(allowanceDetail) : [];
	return (
		<div className="mm-account-copy account-plan">
			{billing?.available ? (
				<AccountBilling billing={billing} meters={meters} sentence={allowance ?? null} />
			) : null}
			{!billing?.available && meters.length > 0 ? (
				<PlanMeter meters={meters} sentence={allowance ?? null} />
			) : null}
			{meters.length === 0 && allowance ? (
				<p className="mm-account-allowance">{allowance}</p>
			) : null}
			<div className="mm-account-actions">
				{billing?.available ? null : <a href="/">About Typelapse</a>}
				<a href="/pricing">Plans and pricing</a>
			</div>
		</div>
	);
}

function AccountNotice({ notice }: { readonly notice: BillingNotice }) {
	return (
		<output className="mm-account-notice" data-kind={notice.kind}>
			{notice.sentence}
		</output>
	);
}

/** The plan card, with the sandbox line above it when the server says it is one. */
function AccountBilling({
	billing,
	meters,
	sentence,
}: {
	readonly billing: StudioBillingControl;
	readonly meters: readonly QuotaMeter[];
	readonly sentence: string | null;
}) {
	if (!billing.available) return null;
	return (
		<>
			<TestModeLine environment={billing.catalog?.environment} />
			<PlanCard billing={billing} meters={meters} sentence={sentence} />
		</>
	);
}

function PlanCard({
	billing,
	meters,
	sentence,
}: {
	readonly billing: StudioBillingControl;
	readonly meters: readonly QuotaMeter[];
	readonly sentence: string | null;
}) {
	const meter = meters.length > 0 ? <PlanMeter meters={meters} sentence={sentence} /> : null;
	if (billing.paid) {
		return (
			<div className="mm-account-plan-card" data-plan="paid">
				<div>
					<span>Current plan</span>
					<strong>{billing.planLabel}</strong>
				</div>
				<button type="button" disabled={billing.busy} onClick={billing.onManageBilling}>
					Manage billing
				</button>
				{meter}
				{billing.error ? <p role="alert">{billing.error}</p> : null}
			</div>
		);
	}

	// A payment that failed is fixed in the portal; a second checkout would start
	// a second subscription beside the one that is behind.
	if (billing.notice?.kind === "past-due") {
		return (
			<div className="mm-account-plan-card" data-plan="past-due">
				<div className="mm-account-plan-heading">
					<div>
						<span>Current plan</span>
						<strong>{billing.planLabel}</strong>
					</div>
				</div>
				<AccountNotice notice={billing.notice} />
				{meter}
				<button
					type="button"
					className="mm-account-primary"
					disabled={billing.busy}
					onClick={billing.onManageBilling}
				>
					Manage billing
				</button>
				{billing.error ? <p role="alert">{billing.error}</p> : null}
			</div>
		);
	}

	const monthly = billing.catalog?.creator.monthly;
	const annual = billing.catalog?.creator.annual;
	const selectedPrice = billing.catalog?.creator[billing.cadence];
	// The upgrade sits under the meter, and above it once a quota is close to its
	// ceiling: that is the moment it is wanted (Dub's sidebar does the same).
	const upgradeFirst = nearAnyLimit(meters);
	const upgrade = (
		<>
			{monthly && annual ? (
				<div className="mm-account-cadence" aria-label="Creator billing cadence">
					<button
						type="button"
						aria-label="Monthly billing"
						aria-pressed={billing.cadence === "monthly"}
						onClick={() => billing.onCadence("monthly")}
					>
						{priceLabel(monthly, "monthly")}
					</button>
					<button
						type="button"
						aria-label="Annual billing"
						aria-pressed={billing.cadence === "annual"}
						onClick={() => billing.onCadence("annual")}
					>
						{priceLabel(annual, "annual")}
					</button>
				</div>
			) : null}
			{selectedPrice ? (
				<button
					type="button"
					className="mm-account-primary"
					disabled={billing.busy}
					onClick={billing.onUpgrade}
				>
					{billing.busy ? "Opening secure checkout…" : "Upgrade to Creator"}
				</button>
			) : null}
		</>
	);
	return (
		<div
			className="mm-account-plan-card"
			data-plan="free"
			data-near-limit={upgradeFirst ? "" : undefined}
		>
			<div className="mm-account-plan-heading">
				<div>
					<span>Current plan</span>
					<strong>{billing.planLabel}</strong>
				</div>
				<span>Private cloud + render compute</span>
			</div>
			{billing.notice ? <AccountNotice notice={billing.notice} /> : null}
			{upgradeFirst ? upgrade : null}
			{meter}
			{upgradeFirst ? null : upgrade}
			{billing.error ? <p role="alert">{billing.error}</p> : null}
		</div>
	);
}
