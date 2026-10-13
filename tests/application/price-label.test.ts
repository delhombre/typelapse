import { priceLabel } from "@/application/billing/price-label";
import { describe, expect, it } from "vitest";

describe("a Creator price, worded once for every surface", () => {
	it("drops the cents of a whole amount and keeps them otherwise", () => {
		expect(priceLabel({ currency: "USD", unitAmount: 12000 }, "annual")).toBe("$120 / year");
		expect(priceLabel({ currency: "USD", unitAmount: 1200 }, "monthly")).toBe("$12 / month");
		expect(priceLabel({ currency: "EUR", unitAmount: 950 }, "monthly")).toBe("€9.50 / month");
	});
});
