import type { BillingCadence, BillingPrice } from "../../domain/ports/billing.port";

/**
 * A Creator price as every surface words it ("$120 / year"): the account panel,
 * the hosted render sheet and the pricing page. The amount is in the currency's
 * smallest unit; a whole amount drops its cents.
 */
export function priceLabel(price: BillingPrice, cadence: BillingCadence): string {
	const amount = price.unitAmount / 100;
	const formatted = new Intl.NumberFormat("en", {
		style: "currency",
		currency: price.currency,
		minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
		maximumFractionDigits: 2,
	}).format(amount);
	return `${formatted} / ${cadence === "monthly" ? "month" : "year"}`;
}
