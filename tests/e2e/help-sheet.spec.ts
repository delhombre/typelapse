import { type Page, devices } from "@playwright/test";
import { expect, openStudio, test } from "./support/studio";

/**
 * Help and What's new (#259, #260): one sheet, reached from the island on a
 * desktop and from More on a phone, three sections of plain sentences and a
 * card of the latest changes that stays away once it is dismissed.
 */

const SECTIONS = ["How scenes work", "Focus lines", "Keyboard shortcuts"];

async function readSheet(page: Page) {
	const sheet = page.getByRole("dialog", { name: "Help" });
	await expect(sheet).toBeVisible();
	for (const name of SECTIONS) {
		await expect(sheet.getByRole("heading", { name })).toBeVisible();
	}
	// The example is the one the field takes, and the sentence reads it.
	await expect(sheet.locator("code", { hasText: "2-4, 7" })).toBeVisible();
	await expect(sheet.getByText("keeps lines 2, 3, 4 and 7 bright.")).toBeVisible();
	await expect(sheet.getByRole("link", { name: "How it works" })).toHaveAttribute(
		"href",
		"/#how-it-works",
	);
	return sheet;
}

test.describe("Help on a desktop", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("opens from the island, names its keys for the platform, and keeps What's new away once dismissed", async ({
		page,
	}) => {
		await openStudio(page);
		const help = page.getByRole("button", { name: "Help", exact: true });
		await expect(help.locator(".sc-new-dot")).toBeVisible();

		await help.click();
		const sheet = await readSheet(page);

		// The undo row carries the platform's modifier as a keycap.
		const modifier = await page.evaluate(() => {
			// What the browser reports about itself, user-agent data first: an emulated
			// user agent (Playwright's Desktop Chrome says Windows on a Mac) moves it.
			const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
			const platform = nav.userAgentData?.platform || nav.platform;
			return /mac|iphone|ipad|ipod/i.test(platform) ? "Cmd" : "Ctrl";
		});
		const undo = sheet.locator(".help-shortcuts li", { hasText: "Undo" });
		await expect(undo.locator("kbd")).toHaveText([modifier, "Z"]);

		const news = sheet.getByRole("region", { name: "What's new" });
		await expect(news.getByRole("listitem")).toHaveCount(3);
		await news.getByRole("button", { name: "Dismiss" }).click();
		await expect(news).toHaveCount(0);
		await expect(help.locator(".sc-new-dot")).toHaveCount(0);

		await page.keyboard.press("Escape");
		await expect(sheet).toBeHidden();
		await expect(help).toBeFocused();

		await page.reload();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		await expect(help.locator(".sc-new-dot")).toHaveCount(0);
		await help.click();
		const again = await readSheet(page);
		await expect(again.getByRole("region", { name: "What's new" })).toHaveCount(0);
	});

	test("is reachable with the keyboard alone", async ({ page }) => {
		await openStudio(page);
		const help = page.getByRole("button", { name: "Help", exact: true });
		await help.focus();
		await page.keyboard.press("Enter");
		const sheet = await readSheet(page);
		await page.keyboard.press("Tab");
		await expect(sheet.locator(":focus")).toBeVisible();
	});
});

const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];

test.describe("Help on a phone", () => {
	test.use({ ...phone, viewport: { width: 390, height: 844 } });

	test("opens from More, and a dismissed What's new stays dismissed across a reload", async ({
		page,
	}) => {
		await openStudio(page);
		const more = page.getByRole("button", { name: "More actions" });
		await expect(more.locator(".sc-new-dot")).toBeVisible();

		await more.tap();
		const row = page.getByRole("button", { name: "Help", exact: true });
		await expect(row.locator(".sc-new-dot")).toBeVisible();
		// Its own height, not the box a scale-in is still arriving at.
		expect(await row.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
		await row.tap();

		const sheet = await readSheet(page);
		await sheet.getByRole("button", { name: "Dismiss" }).tap();
		await expect(sheet.getByRole("region", { name: "What's new" })).toHaveCount(0);
		await sheet.getByRole("button", { name: "Close help" }).tap();
		await expect(sheet).toBeHidden();

		await page.reload();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		const moreAgain = page.getByRole("button", { name: "More actions" });
		await expect(moreAgain.locator(".sc-new-dot")).toHaveCount(0);
		await moreAgain.tap();
		await expect(
			page.getByRole("button", { name: "Help", exact: true }).locator(".sc-new-dot"),
		).toHaveCount(0);
		await page.getByRole("button", { name: "Help", exact: true }).tap();
		const again = await readSheet(page);
		await expect(again.getByRole("region", { name: "What's new" })).toHaveCount(0);
	});

	test("the sheet's rows are 44px tall under a finger", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "More actions" }).tap();
		await page.getByRole("button", { name: "Help", exact: true }).tap();
		const sheet = await readSheet(page);
		const heights = await sheet
			.locator(".help-shortcuts li")
			.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
		for (const height of heights) {
			expect(height).toBeGreaterThanOrEqual(44);
		}
		// The sheet fits the screen's width: no sideways scroll.
		const overflow = await sheet
			.locator(".help-body")
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
