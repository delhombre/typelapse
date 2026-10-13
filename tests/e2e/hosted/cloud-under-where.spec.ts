import type { Page } from "@playwright/test";
import { allowanceSentence } from "../../../src/application/billing/plan-allowance";
import { Plan } from "../../../src/domain/value-objects/plan";
import {
	type TestAccount,
	cloudProjectCount,
	codeFor,
	makeCreator,
	newAccount,
	renderJobsOf,
	signUpInIsland,
} from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

/**
 * Cloud under Where, in the three states a hosted visitor can be in (ux-waves D3,
 * #254): the paid side is listed for everyone and gated only at the press.
 * Signed out, the press explains a hosted render and signs in inside the sheet;
 * on Free it shows the allowance and starts Creator's checkout; on Creator it
 * chooses Cloud. Nothing is uploaded or queued for a plan without hosted renders.
 */

const SHEET = "Render on Typelapse Cloud";
const EMPTY_USAGE = {
	cloudProjects: 0,
	mediaBytes: 0,
	hostedRenderMsThisMonth: 0,
	activeRenders: 0,
};

async function pressCloud(page: Page) {
	await page.getByRole("button", { name: /^Export · / }).click();
	await page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }).click();
}

/** The code flow, inside the sheet: the address, the mailed code, signed in at six digits. */
async function signInInSheet(page: Page, account: TestAccount) {
	const sheet = page.getByRole("dialog", { name: SHEET });
	await sheet.getByRole("button", { name: "Sign in" }).click();
	await sheet.getByRole("textbox", { name: "Email" }).fill(account.email);
	const since = new Date();
	await sheet.getByRole("button", { name: "Email me a code" }).click();
	await sheet.getByRole("textbox", { name: "Code" }).fill(await codeFor(account.email, since));
}

test.describe("Hosted: Cloud under Where is visible to everyone, gated at the press", () => {
	test("signed out, Cloud explains a hosted render; signing in there turns it into Creator's checkout", async ({
		page,
	}) => {
		const account = newAccount("where");
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		// Polar's hosted pages are not ours to load: the journey stops at the redirect.
		const reached: string[] = [];
		await page.route("https://sandbox.polar.sh/**", (route) => {
			reached.push(new URL(route.request().url()).pathname);
			return route.fulfill({ contentType: "text/html", body: "<title>Polar</title>" });
		});
		const cloudCalls: string[] = [];
		page.on("request", (request) => {
			const path = new URL(request.url()).pathname;
			if (path.startsWith("/api/cloud")) cloudCalls.push(`${request.method()} ${path}`);
		});

		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();

		await test.step("signed out: the sheet says what Cloud adds, and Where stays on this device", async () => {
			await pressCloud(page);
			const sheet = page.getByRole("dialog", { name: SHEET });
			await expect(sheet).toBeVisible();
			await expect(sheet.getByText("Captions and audio baked into the video.")).toBeVisible();
			await expect(sheet.getByRole("button", { name: "Sign in" })).toBeVisible();
			const cloud = page
				.getByRole("group", { name: "Where" })
				.getByRole("button", { name: "Cloud" });
			// Gated, it is a button that opens a dialog, not a toggle left off.
			await expect(cloud).toHaveAttribute("aria-haspopup", "dialog");
			await expect(cloud).not.toHaveAttribute("aria-pressed");

			// Escape closes the sheet and leaves the export panel open, focus on Cloud.
			await page.keyboard.press("Escape");
			await expect(sheet).toBeHidden();
			await expect(cloud).toBeFocused();
			expect(cloudCalls).toEqual([]);
		});

		await test.step("Sign in is the account's code form, in the sheet", async () => {
			await page
				.getByRole("group", { name: "Where" })
				.getByRole("button", { name: "Cloud" })
				.click();
			await signInInSheet(page, account);
			await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();
		});

		await test.step("on Free: the allowance, then one Upgrade to Creator that reaches checkout", async () => {
			const sheet = page.getByRole("dialog", { name: SHEET });
			await expect(sheet.getByText(allowanceSentence(Plan.free(), EMPTY_USAGE))).toBeVisible();
			await sheet.getByRole("button", { name: "Upgrade to Creator" }).click();
			await expect.poll(() => reached.some((path) => path.startsWith("/checkout/"))).toBe(true);
		});

		// Nothing was saved or queued for a render the plan does not include.
		expect(await cloudProjectCount(account.email)).toBe(0);
		expect(await renderJobsOf(account.email)).toEqual([]);
	});

	test("a free account pressing Cloud gets the upgrade sheet, and the server still refuses a render with its 402", async ({
		page,
	}) => {
		const account = newAccount("free");
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);

		await pressCloud(page);
		const sheet = page.getByRole("dialog", { name: SHEET });
		await expect(sheet.getByText(allowanceSentence(Plan.free(), EMPTY_USAGE))).toBeVisible();
		await expect(sheet.getByRole("button", { name: "Upgrade to Creator" })).toBeVisible();
		await expect(sheet.getByRole("button", { name: "Sign in" })).toHaveCount(0);
		await sheet.getByRole("button", { name: "Close", exact: true }).click();
		await expect(sheet).toBeHidden();
		const cloud = page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" });
		await expect(cloud).toHaveAttribute("aria-haspopup", "dialog");
		await expect(cloud).not.toHaveAttribute("aria-pressed");
		await expect(page.getByTestId("cloud-render-status")).toHaveCount(0);

		// The gate is the server's, not the sheet's: a render asked for anyway is refused
		// before its body, in the plan's own words.
		const refusal = await page.evaluate(async () => {
			const response = await fetch("/api/cloud/render", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ renderOptions: { format: "mp4", width: 1920, height: 1080 } }),
			});
			return { status: response.status, body: await response.json() };
		});
		expect(refusal.status).toBe(402);
		expect(refusal.body).toMatchObject({ code: "plan-limit", upgradeTo: "creator" });
		expect(await cloudProjectCount(account.email)).toBe(0);
		expect(await renderJobsOf(account.email)).toEqual([]);
	});

	test("a Creator pressing Cloud chooses it, with no sheet, and reads the allowance", async ({
		page,
	}) => {
		const account = newAccount("creator-where");
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);
		await makeCreator(account.email);
		await page.reload();
		await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();

		await pressCloud(page);
		await expect(
			page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }),
		).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
		await expect(page.getByTestId("cloud-render-status")).toHaveText(
			allowanceSentence(Plan.pro(), EMPTY_USAGE),
		);
	});
});

test.describe("Hosted, on a phone: the sheet is a bottom sheet under a thumb", () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("signed out, Cloud raises a full-width sheet whose one action is 44px and on screen", async ({
		page,
	}) => {
		await openStudio(page);
		await page.locator(".si-cta").tap();
		const cloud = page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" });
		await cloud.scrollIntoViewIfNeeded();
		await cloud.tap();

		const sheet = page.getByRole("dialog", { name: SHEET });
		const action = sheet.getByRole("button", { name: "Sign in" });
		await expect(action).toBeVisible();
		await expect(action).toBeInViewport({ ratio: 1 });
		const box = await action.boundingBox();
		expect(box?.height).toBeGreaterThanOrEqual(44);
		const panel = await page.locator(".hosted-render-sheet").boundingBox();
		expect(Math.round(panel?.width ?? 0)).toBe(390);

		// The X is 34px drawn and 44px to a finger; it closes the sheet, not the Export panel.
		await sheet.getByRole("button", { name: "Close", exact: true }).tap();
		await expect(sheet).toBeHidden();
		await expect(cloud).toBeVisible();
	});
});
