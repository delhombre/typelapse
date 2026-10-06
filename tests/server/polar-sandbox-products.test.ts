import { createPolar } from "@polar-sh/sdk/2026-10";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureCreatorProducts } from "../../scripts/polar-sandbox-products";
import { createFakePolar } from "../support/fake-polar";

let fake: ReturnType<typeof createFakePolar>;
let polar: ReturnType<typeof createPolar>;

beforeEach(async () => {
	fake = createFakePolar();
	polar = createPolar({ accessToken: "polar_oat_test", baseUrl: await fake.start() });
});

afterEach(() => fake.stop());

describe("sandbox products script", () => {
	it("creates the monthly product at $12 and the yearly one at $99, in USD", async () => {
		const ids = await ensureCreatorProducts(polar);

		const monthly = fake.products.get(ids.monthly);
		const yearly = fake.products.get(ids.annual);
		expect(monthly).toMatchObject({
			name: "Creator, monthly",
			recurring_interval: "month",
			prices: [{ price_amount: 1200, price_currency: "usd" }],
		});
		expect(yearly).toMatchObject({
			name: "Creator, yearly",
			recurring_interval: "year",
			prices: [{ price_amount: 9900, price_currency: "usd" }],
		});
	});

	it("finds the products by name on a second run instead of creating them again", async () => {
		const first = await ensureCreatorProducts(polar);
		const second = await ensureCreatorProducts(polar);

		expect(second).toEqual(first);
		expect(fake.products.size).toBe(2);
		expect(fake.requests.filter((r) => r.route === "POST /v1/products")).toHaveLength(2);
	});

	it("does not reuse a product of the right name whose price is wrong, and says so", async () => {
		await ensureCreatorProducts(polar);
		const monthly = [...fake.products.values()].find((p) => p.name === "Creator, monthly");
		if (monthly?.prices[0]) monthly.prices[0].price_amount = 900;

		await expect(ensureCreatorProducts(polar)).rejects.toThrow(
			"Creator, monthly is priced 900 USD cents, expected 1200",
		);
		expect(fake.products.size).toBe(2);
	});

	it("creates only the product that is missing", async () => {
		await ensureCreatorProducts(polar);
		const yearlyId = [...fake.products.values()].find((p) => p.name === "Creator, yearly")?.id;
		fake.products.delete(yearlyId ?? "");

		const ids = await ensureCreatorProducts(polar);

		expect(fake.products.size).toBe(2);
		expect(ids.annual).not.toBe(yearlyId);
	});
});
