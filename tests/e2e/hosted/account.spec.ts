import { allowanceSentence } from "../../../src/application/billing/plan-allowance";
import { Plan } from "../../../src/domain/value-objects/plan";
import {
	cloudProjectCount,
	codeFor,
	newAccount,
	openAccountPanel,
	signUpInIsland,
} from "../support/hosted";
import { expect, openStudio, settled, storedScenes, test } from "../support/studio";

/** The sentence the island shows a free account, built from the same Plan the server uses. */
function freeSentence(cloudProjects: number): string {
	return allowanceSentence(Plan.free(), {
		cloudProjects,
		mediaBytes: 0,
		hostedRenderMsThisMonth: 0,
		activeRenders: 0,
	});
}

test.describe("Hosted account: sign up, consent, cloud save", () => {
	test("a visitor signs up in the island, and nothing reaches the cloud until they save", async ({
		page,
	}) => {
		const account = newAccount("save");
		// Every write a cloud copy makes: the project row and any media upload.
		const cloudWrites: string[] = [];
		page.on("request", (request) => {
			const { pathname } = new URL(request.url());
			if (request.method() !== "GET" && /^\/api\/(projects|assets)\b/.test(pathname)) {
				cloudWrites.push(`${request.method()} ${pathname}`);
			}
		});
		// The first save asks whether the cloud has a copy, and that answers 200
		// either way: a 404 here is a red line in the browser's console (#209).
		const refusals: string[] = [];
		page.on("response", (response) => {
			const { pathname } = new URL(response.url());
			if (/^\/api\/projects\b/.test(pathname) && response.status() >= 400) {
				refusals.push(`${response.status()} ${pathname}`);
			}
		});

		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);

		const panel = await openAccountPanel(page, account);
		await expect(panel.getByText("On this device", { exact: true })).toBeVisible();
		await expect(panel.getByText(freeSentence(0), { exact: true })).toBeVisible();
		// Signing up is not consent to upload: the project stays on this device.
		expect(cloudWrites).toEqual([]);
		expect(await cloudProjectCount(account.email)).toBe(0);

		await panel.getByRole("button", { name: "Save this project to cloud" }).click();
		await expect(panel.getByText("Cloud copy saved", { exact: true })).toBeVisible();
		expect(cloudWrites).toContain("POST /api/projects");
		expect(refusals).toEqual([]);
		expect(await cloudProjectCount(account.email)).toBe(1);

		// The session and the cloud copy outlive the tab. The composition saves on
		// a debounce, so the reload waits until it is written.
		await expect.poll(async () => (await storedScenes(page)).length).toBe(1);
		await page.reload();
		const again = await openAccountPanel(page, account);
		// The island still knows this project's cloud copy, so it does not offer
		// to make a second one.
		await expect(again.getByText("Cloud copy saved", { exact: true })).toBeVisible();
		await expect(again.getByText(freeSentence(1), { exact: true })).toBeVisible();
		expect(await cloudProjectCount(account.email)).toBe(1);
	});

	// Found by this journey (#127): the island compared the raw composition,
	// whose settings and live code stay as loaded, with the saved document, so a
	// reload with no edit read "Cloud copy out of date".
	test("a reload with no edit still reads Cloud copy saved, and writes nothing", async ({
		page,
	}) => {
		const account = newAccount("drift");
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);
		const panel = await openAccountPanel(page, account);
		await panel.getByRole("button", { name: "Save this project to cloud" }).click();
		await expect(panel.getByText("Cloud copy saved", { exact: true })).toBeVisible();
		await expect.poll(async () => (await storedScenes(page)).length).toBe(1);

		const writesAfterReload: string[] = [];
		page.on("request", (request) => {
			const { pathname } = new URL(request.url());
			if (request.method() !== "GET" && /^\/api\/(projects|assets)\b/.test(pathname)) {
				writesAfterReload.push(`${request.method()} ${pathname}`);
			}
		});
		await page.reload();
		const again = await openAccountPanel(page, account);
		await expect(again.getByText("Cloud copy saved", { exact: true })).toBeVisible({
			timeout: 5_000,
		});
		await expect(again.getByRole("button", { name: "Save changes" })).toHaveCount(0);
		expect(writesAfterReload).toEqual([]);
	});
});

test.describe("Hosted account: a refused code leaves the form where it was", () => {
	// Found by the phone's second pass (#153): the alert landed between the fields and the
	// button and pushed the button 43px down under the finger that had pressed it. A refused
	// code is cleared and the field takes focus again, ready for the code to be typed again.
	test("the panel is opaque, the button stays put and the code field is ready when the refusal arrives", async ({
		page,
	}) => {
		const account = newAccount("refused");
		await openStudio(page);
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		const panel = page.getByRole("dialog", { name: "Typelapse account" });

		// The panel holds a form, so it is the opaque studio surface (DECISIONS D5), like a menu.
		expect(
			await panel.evaluate((element) => {
				const style = getComputedStyle(element);
				return { background: style.backgroundColor, blur: style.backdropFilter };
			}),
		).toEqual({ background: "rgb(255, 255, 255)", blur: "none" });

		await panel.getByRole("textbox", { name: "Email" }).fill(account.email);
		const since = new Date();
		await panel.getByRole("button", { name: "Email me a code" }).click();
		const code = panel.getByRole("textbox", { name: "Code" });
		await expect(code).toBeFocused();
		const right = await codeFor(account.email, since);
		const wrong = right === "000000" ? "111111" : "000000";

		const submit = panel.getByRole("button", { name: "Sign in", exact: true });
		// The panel scales in over 160ms; measure it standing still.
		await settled(panel);
		const before = await submit.boundingBox();
		const panelBefore = await panel.boundingBox();
		await code.fill(wrong);
		await expect(panel.getByRole("alert")).toHaveText("That code does not match. Try again.");

		const after = await submit.boundingBox();
		expect(after?.y).toBe(before?.y);
		expect((await panel.boundingBox())?.height).toBe(panelBefore?.height);
		await expect(code).toHaveValue("");
		await expect(code).toBeFocused();

		// The same code, typed right, still signs in: a wrong try spends one of three.
		await code.fill(right);
		await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();
	});
});

test.describe("Hosted account: the sign-in form follows the forms checklist", () => {
	// Placeholders are examples under a label that stays; a mouse's cursor lands in the field the
	// form opens on and follows the person through the two steps; a wrong address is said when the
	// field is left, beside it. A finger's version of this (no raised keyboard) is in the phone
	// shell's sign-in journey.
	test("an example in each field, the cursor where the person types, a wrong address said on leaving", async ({
		page,
	}) => {
		const account = newAccount("checklist");
		await openStudio(page);
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		const panel = page.getByRole("dialog", { name: "Typelapse account" });
		const email = panel.getByRole("textbox", { name: "Email" });

		await expect(email).toBeFocused();
		await expect(email).toHaveAttribute("placeholder", "you@company.com");

		await email.fill("ada@");
		await expect(email).not.toHaveAttribute("aria-invalid", "true");
		await email.press("Tab");
		await expect(email).toHaveAttribute("aria-invalid", "true");
		await expect(panel.getByText("Enter an email address like ada@example.com.")).toBeVisible();
		await email.fill(account.email);
		await expect(email).not.toHaveAttribute("aria-invalid", "true");

		await panel.getByRole("button", { name: "Email me a code" }).click();
		const code = panel.getByRole("textbox", { name: "Code" });
		await expect(code).toBeFocused();
		await expect(code).toHaveAttribute("placeholder", "123456");
		await expect(code).toHaveAttribute("data-1p-ignore", "true");

		await panel.getByRole("button", { name: "Use another email" }).click();
		await expect(email).toBeFocused();
		await expect(email).toHaveValue(account.email);
	});
});

test.describe("Hosted account: the desktop panel fits what it holds (#272)", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("the sign-in panel has nothing to scroll to, so its foot is not veiled", async ({
		page,
	}) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		const panel = page.getByRole("dialog", { name: "Typelapse account" });
		await expect(panel.getByRole("button", { name: "Email me a code" })).toBeVisible();

		// The foot's veil takes no room of its own: a panel that fits has scrollHeight equal
		// to clientHeight, and says nothing is below it.
		const fit = await panel.evaluate((element) => ({
			scroll: element.scrollHeight,
			client: element.clientHeight,
			below: element.getAttribute("data-more-below"),
		}));
		expect(fit.scroll).toBe(fit.client);
		expect(fit.below).toBe("false");
	});
});
