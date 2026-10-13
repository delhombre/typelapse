import type { BillingCadence, BillingPrice } from "../../domain/ports/billing.port";

/**
 * ISO 4217 minor units for the currencies that are not two-decimal. Intl is the
 * source of truth (`minorUnitDigits`); this table covers a runtime whose ICU data
 * is trimmed and would answer 2 for a currency that has none or three.
 */
const MINOR_UNIT_DIGITS: Readonly<Record<string, number>> = {
	JPY: 0,
	KRW: 0,
	CLP: 0,
	ISK: 0,
	VND: 0,
	UGX: 0,
	BHD: 3,
	KWD: 3,
	OMR: 3,
};

const DEFAULT_MINOR_UNIT_DIGITS = 2;

function minorUnitDigits(currency: string): number {
	const code = currency.toUpperCase();
	const known = MINOR_UNIT_DIGITS[code];
	if (known !== undefined) {
		return known;
	}
	try {
		const formatter = new Intl.NumberFormat("en", { style: "currency", currency: code });
		return formatter.resolvedOptions().maximumFractionDigits ?? DEFAULT_MINOR_UNIT_DIGITS;
	} catch {
		return DEFAULT_MINOR_UNIT_DIGITS;
	}
}

function formatAmount(currency: string, amount: number, digits: number): string {
	const fraction = {
		minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
		maximumFractionDigits: digits,
	};
	try {
		return new Intl.NumberFormat("en", { style: "currency", currency, ...fraction }).format(amount);
	} catch {
		// A malformed code is not a currency Intl can name: show the code as the symbol.
		return `${currency}\u00a0${new Intl.NumberFormat("en", fraction).format(amount)}`;
	}
}

/**
 * A Creator price as every surface words it ("$120 / year"): the account panel,
 * the hosted render sheet and the pricing page. The amount is in the currency's
 * smallest unit, whose size depends on the currency (a yen has no cents, a dinar
 * has thousandths); a whole amount drops its fraction.
 */
export function priceLabel(price: BillingPrice, cadence: BillingCadence): string {
	const digits = minorUnitDigits(price.currency);
	const amount = price.unitAmount / 10 ** digits;
	return `${formatAmount(price.currency, amount, digits)} / ${cadence === "monthly" ? "month" : "year"}`;
}
