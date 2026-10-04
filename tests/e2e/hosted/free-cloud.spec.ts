import { allowanceSentence } from "../../../src/application/billing/plan-allowance";
import { Plan } from "../../../src/domain/value-objects/plan";
import { cloudProjectCount, newAccount, renderJobsOf, signUpInIsland } from "../support/hosted";
import { expect, openStudio, test } from "../support/studio";

test.describe("Hosted free plan: Cloud is offered, and refused with the plan's own words", () => {
	test("a free account reads its allowance under Cloud, and Render gets the 402 sentence without uploading", async ({
		page,
	}) => {
		const account = newAccount("free");
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);

		await page.getByRole("button", { name: /^Export · / }).click();
		await page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }).click();

		// Choosing Cloud reads the allowance first: the plan says what it includes
		// before anything is pressed.
		const status = page.getByTestId("cloud-render-status");
		await expect(status).toHaveText(
			allowanceSentence(Plan.free(), {
				cloudProjects: 0,
				mediaBytes: 0,
				hostedRenderMsThisMonth: 0,
				activeRenders: 0,
			}),
		);

		const refusal = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === "/api/cloud/render" &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: /^Render · / }).click();
		const response = await refusal;
		expect(response.status()).toBe(402);
		const body = (await response.json()) as { error: string; code: string; upgradeTo: string };
		expect(body).toMatchObject({ code: "plan-limit", upgradeTo: "creator" });
		await expect(status).toContainText(body.error);

		// The route refuses before the body: no project was saved, no job queued.
		expect(await cloudProjectCount(account.email)).toBe(0);
		expect(await renderJobsOf(account.email)).toEqual([]);
	});
});
