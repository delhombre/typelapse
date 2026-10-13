import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/studio";

/**
 * Ticket #256: the public /pricing page, drawn from the billing catalog.
 * `PROOF_DIR` keeps the screenshots a reviewer compares (360, 390 and 1440,
 * both themes, priced, unpriced and sandbox).
 */

const PRICED = {
	environment: "production",
	creator: {
		monthly: { currency: "USD", unitAmount: 1200 },
		annual: { currency: "USD", unitAmount: 12000 },
	},
};

async function catalogIs(page: Page, status: number, body: unknown): Promise<void> {
	await page.route("**/api/billing/catalog", (route) =>
		route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
	);
}

async function openPricing(page: Page, theme: "light" | "dark" = "light"): Promise<void> {
	await page.addInitScript((value) => {
		window.localStorage.setItem("typelapse.landing-theme", value);
	}, theme);
	await page.goto("/pricing");
	await expect(page.getByRole("heading", { level: 1, name: /Free on your machine/ })).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
}

test.describe("Pricing: a visitor reads the plans before signing in", { tag: "@smoke" }, () => {
	test("with prices, the Creator card shows the annual price first", async ({
		page,
		consoleErrors,
	}) => {
		await catalogIs(page, 200, PRICED);
		await openPricing(page);

		const card = page.getByTestId("creator-card");
		await expect(card).toHaveAttribute("data-price-state", "priced");
		await expect(page.getByRole("link", { name: "Start a hosted render" })).toHaveAttribute(
			"href",
			"/app",
		);
		await expect(page.getByTestId("creator-price")).toContainText("$120 / year");
		await expect(page.getByTestId("creator-price")).toContainText("or $12 / month");
		await expect(page.getByText("Test mode: no real charges")).toHaveCount(0);
		expect(consoleErrors).toEqual([]);
	});

	test("with no price in the catalog, no number appears on the Creator card", async ({ page }) => {
		await catalogIs(page, 200, { creator: {} });
		await openPricing(page);

		const card = page.getByTestId("creator-card");
		await expect(card).toHaveAttribute("data-price-state", "unpriced");
		await expect(page.getByTestId("creator-price")).toHaveText("The price is not published yet.");
		const text = (await card.textContent()) ?? "";
		expect(text).not.toMatch(/\d/);
		expect(text).not.toMatch(/[$€£]/);
		await expect(page.getByRole("link", { name: "Start a hosted render" })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "See Creator in the studio" })).toBeVisible();
		// The rest of the page keeps its facts, which are not prices.
		await expect(page.getByRole("cell", { name: "60 minutes a month" })).toBeVisible();
	});

	test("when billing answers 503, the page shows no price and no error", async ({ page }) => {
		await catalogIs(page, 503, { error: "Hosted billing is not configured" });
		await openPricing(page);

		const card = page.getByTestId("creator-card");
		await expect(card).toHaveAttribute("data-price-state", "unpriced");
		expect((await card.textContent()) ?? "").not.toMatch(/\d|[$€£]/);
		await expect(page.getByRole("alert")).toHaveCount(0);
		// Billing is not configured, so no hosted render is promised: the same link, a neutral name.
		await expect(page.getByRole("link", { name: "Start a hosted render" })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "See Creator in the studio" })).toHaveAttribute(
			"href",
			"/app",
		);
	});

	test("on the sandbox, the test mode line stands beside the price", async ({ page }) => {
		await catalogIs(page, 200, { ...PRICED, environment: "sandbox" });
		await openPricing(page);

		await expect(
			page.getByTestId("creator-card").getByText("Test mode: no real charges"),
		).toBeVisible();
	});

	test("the pill marks the page, the table and the questions answer", async ({ page }) => {
		await catalogIs(page, 200, PRICED);
		await openPricing(page);

		await expect(page.getByRole("link", { name: "Pricing", exact: true }).first()).toBeVisible();
		// The pill and the footer both name the page they are on.
		await expect(page.locator('a[aria-current="page"]')).toHaveText(["Pricing", "Pricing"]);
		const table = page.getByRole("table");
		await expect(table.getByRole("row", { name: /Hosted render time/ })).toContainText(
			"60 minutes a month",
		);
		const cancel = page.getByText("What happens to my videos if I cancel?");
		await cancel.click();
		await expect(
			page.getByText(/stay downloadable for 30 days after your plan ends/),
		).toBeVisible();
		await expect(page.getByText("Refunds", { exact: true })).toBeVisible();
	});

	test("the first screen holds one way into the studio, and the pill takes it once the cards leave", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await catalogIs(page, 200, PRICED);
		await openPricing(page);

		const pillCta = page.getByRole("link", { name: "Open studio", exact: true });
		await expect(pillCta).toBeHidden();
		await expect(page.getByRole("link", { name: "Start a hosted render" })).toBeVisible();
		await page.getByRole("table").scrollIntoViewIfNeeded();
		await page.mouse.wheel(0, 600);
		await expect(pillCta).toBeVisible();
	});

	test("the landing and its footer lead here, and the page leads back", async ({ page }) => {
		await catalogIs(page, 200, PRICED);
		await page.goto("/");
		await page.getByRole("link", { name: "See the plans" }).click();
		await expect(page).toHaveURL(/\/pricing$/);
		await expect(
			page.getByRole("heading", { level: 1, name: /Free on your machine/ }),
		).toBeVisible();
		await page.getByRole("link", { name: "Typelapse home" }).click();
		await expect(page).toHaveURL(/\/$/);
		await page.getByRole("contentinfo").getByRole("link", { name: "Pricing" }).click();
		await expect(page).toHaveURL(/\/pricing$/);
	});
});

const WIDTHS = [
	{ name: "360", width: 360, height: 780 },
	{ name: "390", width: 390, height: 844 },
	{ name: "1440", width: 1440, height: 900 },
] as const;

test.describe("Pricing: screenshots @proof", () => {
	test.skip(!process.env.PROOF_DIR, "set PROOF_DIR to keep the screenshots");

	for (const { name, width, height } of WIDTHS) {
		for (const theme of ["light", "dark"] as const) {
			test(`${name} ${theme}`, async ({ page }) => {
				const dir = process.env.PROOF_DIR ?? "";
				mkdirSync(dir, { recursive: true });
				await page.setViewportSize({ width, height });
				await page.emulateMedia({ reducedMotion: "reduce" });

				await catalogIs(page, 200, PRICED);
				await openPricing(page, theme);
				await expect(page.getByTestId("creator-card")).toHaveAttribute(
					"data-price-state",
					"priced",
				);
				await page.getByText("What happens to my videos if I cancel?").click();
				await page.screenshot({ path: join(dir, `${name}-${theme}-priced.png`), fullPage: true });

				await page.unroute("**/api/billing/catalog");
				await catalogIs(page, 503, { error: "Hosted billing is not configured" });
				await openPricing(page, theme);
				await expect(page.getByTestId("creator-card")).toHaveAttribute(
					"data-price-state",
					"unpriced",
				);
				await page.screenshot({ path: join(dir, `${name}-${theme}-unpriced.png`), fullPage: true });

				if (theme === "light") {
					await page.unroute("**/api/billing/catalog");
					await catalogIs(page, 200, { ...PRICED, environment: "sandbox" });
					await openPricing(page, theme);
					await expect(page.getByText("Test mode: no real charges")).toBeVisible();
					await page.screenshot({
						path: join(dir, `${name}-${theme}-sandbox.png`),
						fullPage: true,
					});
				}
			});
		}
	}
});
