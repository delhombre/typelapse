import { type Page, devices } from "@playwright/test";
import { allowanceSentence } from "../../../src/application/billing/plan-allowance";
import { Plan } from "../../../src/domain/value-objects/plan";
import { makeCreator, newAccount, signUpInIsland } from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

/**
 * The Cloud intent (#290): `/app#cloud` opens the hosted render sheet in the state the
 * account is in, once, and clears itself from the URL. Signed out it shows what a hosted
 * render adds and Sign in; on Free the allowance and one Upgrade; on Creator it chooses
 * Cloud and shows no sheet. The pricing page's Creator action is that link.
 */

const SHEET = "Render on Typelapse Cloud";
const EMPTY_USAGE = {
	cloudProjects: 0,
	mediaBytes: 0,
	hostedRenderMsThisMonth: 0,
	activeRenders: 0,
};
const MONACO =
	/\/assets\/(monaco-runtime|editor\.worker|ts\.worker|css\.worker|html\.worker|json\.worker|codicon)-/;

/** A fresh load of the link, as a mail's click is: a hash-only goto from /app would not reload. */
async function openCloud(page: Page): Promise<void> {
	await page.goto("about:blank");
	await page.goto("/app#cloud");
	await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
}

/**
 * Watches the document from its first frame: a sheet that opened and closed again
 * would leave a trace here, where a final assertion would see nothing.
 */
async function watchSheet(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __sheetSeen: boolean };
		w.__sheetSeen = false;
		new MutationObserver(() => {
			if (document.querySelector("dialog[open] .hosted-render-sheet")) w.__sheetSeen = true;
		}).observe(document, { subtree: true, childList: true, attributes: true });
	});
}

function sheetSeen(page: Page): Promise<boolean> {
	return page.evaluate(() => (window as unknown as { __sheetSeen: boolean }).__sheetSeen);
}

test.describe("Hosted: /app#cloud opens the sheet in the state the account is in", () => {
	test("signed out: what a hosted render adds and Sign in, the hash gone, Escape back to Export", async ({
		page,
	}) => {
		await watchSheet(page);
		await openCloud(page);
		const sheet = page.getByRole("dialog", { name: SHEET });
		await expect(sheet).toBeVisible();
		// The positive control for the Creator test's "never seen".
		expect(await sheetSeen(page)).toBe(true);
		await expect(sheet.getByText("Captions and audio baked into the video.")).toBeVisible();
		await expect(sheet.getByRole("button", { name: "Sign in" })).toBeVisible();
		expect(new URL(page.url()).hash).toBe("");

		// Nothing opened it, so the way back is the one #284 defined: the island's Export.
		await page.keyboard.press("Escape");
		await expect(sheet).toBeHidden();
		await expect(page.getByRole("button", { name: /^Export · / })).toBeFocused();

		// Consumed: a reload of the cleaned URL opens nothing.
		await page.reload();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
	});

	test("on Free: the allowance and one Upgrade to Creator, and Cloud not chosen", async ({
		page,
	}) => {
		const account = newAccount("intent-free");
		await openStudio(page);
		await signUpInIsland(page, account);

		await openCloud(page);
		const sheet = page.getByRole("dialog", { name: SHEET });
		await expect(sheet.getByText(allowanceSentence(Plan.free(), EMPTY_USAGE))).toBeVisible();
		await expect(sheet.getByRole("button", { name: "Upgrade to Creator" })).toHaveCount(1);
		await expect(sheet.getByRole("button", { name: "Sign in" })).toHaveCount(0);
		expect(new URL(page.url()).hash).toBe("");

		await sheet.getByRole("button", { name: "Close", exact: true }).click();
		await page.getByRole("button", { name: /^Export · / }).click();
		const cloud = page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" });
		await expect(cloud).not.toHaveAttribute("aria-pressed", "true");
	});

	test("on Creator: lands with Cloud selected and no sheet, not even for a moment", async ({
		page,
	}) => {
		const account = newAccount("intent-creator");
		await openStudio(page);
		await signUpInIsland(page, account);
		await makeCreator(account.email);

		await watchSheet(page);
		await openCloud(page);
		await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();

		// No sheet, so the notice is the only word that Cloud was chosen.
		await expect(page.getByText("Cloud is selected under Where")).toBeVisible();

		await page.getByRole("button", { name: /^Export · / }).click();
		await expect(
			page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }),
		).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
		expect(await sheetSeen(page)).toBe(false);
		expect(new URL(page.url()).hash).toBe("");
	});

	test("the pricing page's Creator action opens the studio on the sheet", async ({ page }) => {
		await page.goto("/pricing");
		const action = page.locator(".pr-card-action a");
		await expect(action).toHaveAttribute("href", "/app#cloud");
		await action.click();
		await expect(page.getByRole("dialog", { name: SHEET })).toBeVisible();
		expect(new URL(page.url()).pathname).toBe("/app");
		expect(new URL(page.url()).hash).toBe("");
	});
});

test.describe("Hosted, on a phone: the sheet opens without the editor", () => {
	const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
	test.use({ ...phone, viewport: { width: 390, height: 844 } });

	test("/app#cloud raises the sheet and requests no Monaco; Sign in answers a tap", async ({
		page,
	}) => {
		const monaco: string[] = [];
		page.on("request", (request) => {
			if (MONACO.test(request.url())) monaco.push(new URL(request.url()).pathname);
		});
		await openCloud(page);
		const sheet = page.getByRole("dialog", { name: SHEET });
		await expect(sheet).toBeVisible();
		await page.waitForLoadState("networkidle");
		expect(monaco).toEqual([]);

		// The code sheet sits behind at its stop: the tap must reach this one.
		await sheet.getByRole("button", { name: "Sign in" }).tap();
		await expect(sheet.getByRole("textbox", { name: "Email" })).toBeVisible();
		expect(monaco).toEqual([]);
	});
});
