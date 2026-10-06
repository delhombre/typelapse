import { ClientAuthFailure } from "../../../src/application/auth/client-auth.port";
import { newAccount, signedOut } from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

/**
 * Better Auth allows three sign-ups or sign-ins per ten seconds per client, the
 * ten seconds counted from the last one it accepted. A visitor who meets that
 * reads that they tried too often and for how long, with the form still there:
 * "Cloud unavailable" is for a service that is out of reach. The unit tests hold
 * the sentence for every header; this holds that the real limiter, the real
 * island and a real browser agree on the number.
 */

const SIGN_UP = "/api/auth/sign-up/email";

test.describe("Hosted account: the auth rate limiter refuses a sign-up", () => {
	test("the island keeps its form, says how long to wait, and the next press signs up", async ({
		page,
	}) => {
		const account = newAccount("limited");
		await openStudio(page);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		const panel = page.getByRole("dialog", { name: "Typelapse account" });
		await panel.getByRole("button", { name: "New here? Create an account" }).click();
		await panel.getByLabel("Name").fill(account.name);
		await panel.getByLabel("Email").fill(account.email);
		await panel.getByLabel("Password").fill(account.password);

		await test.step("a script spends the window: sign-ups, valid or not, count until the first 429", async () => {
			const script = await signedOut();
			let status = 0;
			for (let attempt = 0; attempt < 8 && status !== 429; attempt++) {
				const response = await script.post(SIGN_UP, {
					data: { name: "x", email: "not-an-email", password: "x" },
				});
				status = response.status();
			}
			await script.dispose();
			expect(status).toBe(429);
		});

		const answer = page.waitForResponse((response) => new URL(response.url()).pathname === SIGN_UP);
		await panel.getByRole("button", { name: "Create account" }).click();
		const refusal = await answer;
		expect(refusal.status()).toBe(429);
		const seconds = Number(refusal.headers()["x-retry-after"]);
		expect(seconds).toBeGreaterThanOrEqual(1);

		await test.step("the island says so, and keeps the form with what was typed", async () => {
			await expect(panel.getByRole("alert")).toHaveText(
				new ClientAuthFailure("rate-limited", { retryAfterSeconds: seconds }).message,
			);
			await expect(panel.getByText("Cloud unavailable")).toHaveCount(0);
			await expect(panel.getByLabel("Email")).toHaveValue(account.email);
			await expect(panel.getByRole("button", { name: "Create account" })).toBeEnabled();
		});

		// The window the server named is the one thing there is to wait on.
		await page.waitForTimeout(seconds * 1000 + 250);
		await panel.getByRole("button", { name: "Create account" }).click();
		await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();
	});
});
