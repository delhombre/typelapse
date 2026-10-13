import { ClientAuthFailure } from "../../../src/application/auth/client-auth.port";
import { HOSTED, newAccount, signInInIsland, signedOut } from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

/**
 * Sending a code mails someone, so it has two ceilings: ten codes an hour to one
 * address, whoever asks, and ten codes per client in ten minutes, whatever the
 * addresses. A visitor who meets either reads that they tried too often and for
 * how long, with the form and what they typed still there: "Cloud unavailable" is
 * for a service that is out of reach. The unit tests hold the sentence for every
 * header; this holds that the real limiters, the real island and a real browser
 * agree on the number.
 */

const SEND_CODE = "/api/auth/email-otp/send-verification-otp";

/** A script asks for codes from `clientIp` until the first 429, at most `tries` times. */
async function spend(
	tries: number,
	request: (attempt: number) => { email: string; clientIp: string },
) {
	const script = await signedOut();
	let status = 0;
	for (let attempt = 0; attempt < tries && status !== 429; attempt++) {
		const { email, clientIp } = request(attempt);
		const response = await script.post(SEND_CODE, {
			data: { email, type: "sign-in" },
			headers: { origin: HOSTED.appUrl, "x-forwarded-for": clientIp },
		});
		status = response.status();
	}
	await script.dispose();
	return status;
}

async function askForCode(page: import("@playwright/test").Page, email: string) {
	const panel = page.getByRole("dialog", { name: "Sign in to Typelapse" });
	await panel.getByRole("textbox", { name: "Email" }).fill(email);
	const answer = page.waitForResponse((response) => new URL(response.url()).pathname === SEND_CODE);
	await panel.getByRole("button", { name: "Email me a code" }).click();
	return { panel, refusal: await answer };
}

test.describe("Hosted account: the code send limits refuse a request", () => {
	test("one address gets ten codes an hour, from however many clients; the island says how long to wait", async ({
		page,
	}) => {
		const account = newAccount("limited");
		await openStudio(page);
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		await page.getByRole("button", { name: "Sign in", exact: true }).click();

		await test.step("scripts on ten other addresses spend the address's hour", async () => {
			const status = await spend(11, (attempt) => ({
				email: account.email,
				clientIp: `198.19.250.${attempt + 1}`,
			}));
			expect(status).toBe(429);
		});

		const { panel, refusal } = await askForCode(page, account.email);
		expect(refusal.status()).toBe(429);
		const seconds = Number(refusal.headers()["x-retry-after"]);
		expect(seconds).toBeGreaterThan(3000);
		expect(seconds).toBeLessThanOrEqual(3600);

		await test.step("the island says so, and keeps the form with what was typed", async () => {
			await expect(panel.getByRole("alert")).toHaveText(
				new ClientAuthFailure("rate-limited", { retryAfterSeconds: seconds }).message,
			);
			await expect(panel.getByText("Cloud unavailable")).toHaveCount(0);
			await expect(panel.getByRole("textbox", { name: "Email" })).toHaveValue(account.email);
			await expect(panel.getByRole("button", { name: "Email me a code" })).toBeEnabled();
		});

		await test.step("the same visitor still gets a code for another address", async () => {
			const other = { ...newAccount("limited-other"), clientIp: account.clientIp };
			await page.getByRole("button", { name: "Close account panel" }).click();
			await expect(panel).toHaveCount(0);
			await signInInIsland(page, other);
		});
	});

	test("one client gets ten codes in ten minutes, whatever the addresses", async ({ page }) => {
		const account = newAccount("crowded");
		await openStudio(page);
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		await page.getByRole("button", { name: "Sign in", exact: true }).click();

		await test.step("a script on the visitor's address spends its ten minutes", async () => {
			const status = await spend(11, (attempt) => ({
				email: `e2e-crowd-${attempt}-${Date.now().toString(36)}@typelapse.test`,
				clientIp: account.clientIp,
			}));
			expect(status).toBe(429);
		});

		const { panel, refusal } = await askForCode(page, account.email);
		expect(refusal.status()).toBe(429);
		const seconds = Number(refusal.headers()["x-retry-after"]);
		expect(seconds).toBeGreaterThanOrEqual(1);
		expect(seconds).toBeLessThanOrEqual(600);
		await expect(panel.getByRole("alert")).toHaveText(
			new ClientAuthFailure("rate-limited", { retryAfterSeconds: seconds }).message,
		);
		await expect(panel.getByRole("textbox", { name: "Email" })).toHaveValue(account.email);
	});
});
