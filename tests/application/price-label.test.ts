import { priceLabel } from "@/application/billing/price-label";
import { describe, expect, it } from "vitest";

describe("a Creator price, worded once for every surface", () => {
	it("drops the cents of a whole amount and keeps them otherwise", () => {
		expect(priceLabel({ currency: "USD", unitAmount: 12000 }, "annual")).toBe("$120 / year");
		expect(priceLabel({ currency: "USD", unitAmount: 1200 }, "monthly")).toBe("$12 / month");
		expect(priceLabel({ currency: "EUR", unitAmount: 950 }, "monthly")).toBe("€9.50 / month");
		expect(priceLabel({ currency: "GBP", unitAmount: 1099 }, "monthly")).toBe("£10.99 / month");
	});

	it("reads a zero-decimal currency's amount as whole units, not hundredths", () => {
		expect(priceLabel({ currency: "JPY", unitAmount: 1200 }, "monthly")).toBe("¥1,200 / month");
		expect(priceLabel({ currency: "KRW", unitAmount: 15000 }, "monthly")).toBe("₩15,000 / month");
		expect(priceLabel({ currency: "CLP", unitAmount: 9990 }, "annual")).toBe(
			"CLP\u00a09,990 / year",
		);
	});

	it("reads a three-decimal currency's amount in thousandths", () => {
		expect(priceLabel({ currency: "KWD", unitAmount: 3500 }, "monthly")).toBe(
			"KWD\u00a03.500 / month",
		);
		expect(priceLabel({ currency: "BHD", unitAmount: 4000 }, "annual")).toBe("BHD\u00a04 / year");
	});

	it("falls back to two decimals and the code as the symbol for a currency Intl does not know", () => {
		expect(priceLabel({ currency: "XYZ", unitAmount: 1250 }, "monthly")).toBe(
			"XYZ\u00a012.50 / month",
		);
		expect(priceLabel({ currency: "XYZ", unitAmount: 1200 }, "monthly")).toBe(
			"XYZ\u00a012 / month",
		);
	});

	it("does not throw on a malformed currency code", () => {
		expect(priceLabel({ currency: "ZZ", unitAmount: 1250 }, "monthly")).toBe(
			"ZZ\u00a012.50 / month",
		);
	});

	it("words zero and negative amounts without crashing", () => {
		expect(priceLabel({ currency: "USD", unitAmount: 0 }, "monthly")).toBe("$0 / month");
		expect(priceLabel({ currency: "JPY", unitAmount: 0 }, "monthly")).toBe("¥0 / month");
		expect(priceLabel({ currency: "USD", unitAmount: -1250 }, "monthly")).toBe("-$12.50 / month");
		expect(priceLabel({ currency: "JPY", unitAmount: -500 }, "annual")).toBe("-¥500 / year");
	});
});
