import type { Locator, Page } from "@playwright/test";
import { newAccount, openAccountPanel, signUpInIsland } from "../support/hosted";
import { expect, openStudio, settled, test } from "../support/studio";

/**
 * The signed-in account as a sheet with tabs (#261, ux-waves UX 12): Projects, Plan
 * and API keys under the person, each keeping its scroll and its focus, Escape back
 * to the trigger, and Sign out in a foot that is always on screen.
 */

const box = async (locator: Locator) => {
	const found = await locator.boundingBox();
	if (!found) throw new Error("not on screen");
	return found;
};

/** The sheet's place against the frame, the island and the timeline, for the record. */
async function placement(page: Page) {
	return page.evaluate(() => {
		const rect = (selector: string) => {
			const found = document.querySelector(selector)?.getBoundingClientRect();
			return found ? { top: Math.round(found.top), bottom: Math.round(found.bottom) } : null;
		};
		return {
			sheet: rect(".account-sheet"),
			frame: rect("[data-preview-frame]"),
			island: rect(".si-island"),
		};
	});
}

test.describe("Hosted account sheet: three tabs and Sign out in the foot", () => {
	// A short window, so a tab has something to scroll.
	test.use({ viewport: { width: 1280, height: 600 } });

	test("tabs switch by press and by arrow, keep their scroll and focus, and Escape gives the trigger back", async ({
		page,
	}) => {
		const account = newAccount("sheet");
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await signUpInIsland(page, account);
		const trigger = page.getByRole("button", { name: `Account for ${account.name}` });

		const sheet = await openAccountPanel(page, account);
		await settled(page.locator(".account-sheet"));
		const projects = sheet.getByRole("tab", { name: "Projects" });
		const plan = sheet.getByRole("tab", { name: "Plan" });
		const keys = sheet.getByRole("tab", { name: "API keys" });

		await test.step("it opens on Projects, with focus on that tab", async () => {
			await expect(projects).toHaveAttribute("aria-selected", "true");
			await expect(projects).toBeFocused();
			await expect(sheet.getByRole("button", { name: "Save this project to cloud" })).toBeVisible();
		});

		await test.step("Sign out sits in the foot, inside the window, whatever the tab", async () => {
			const viewport = page.viewportSize();
			for (const tab of [projects, plan, keys]) {
				await tab.click();
				const signOut = sheet.getByRole("button", { name: "Sign out" });
				await expect(signOut).toBeVisible();
				const at = await box(signOut);
				expect(at.y + at.height).toBeLessThanOrEqual(viewport?.height ?? 0);
				expect(await signOut.evaluate((node) => node.closest('[role="tabpanel"]'))).toBeNull();
			}
		});

		await test.step("the arrows walk the tabs and choose as they go", async () => {
			await projects.click();
			await projects.press("ArrowRight");
			await expect(plan).toBeFocused();
			await expect(plan).toHaveAttribute("aria-selected", "true");
			await plan.press("End");
			await expect(keys).toBeFocused();
			await keys.press("ArrowRight");
			await expect(projects).toBeFocused();
			await expect(projects).toHaveAttribute("aria-selected", "true");
		});

		await test.step("Plan keeps its scroll and the control that had focus", async () => {
			await plan.click();
			const panel = sheet.getByRole("tabpanel");
			const scrolled = await panel.evaluate((node) => {
				node.scrollTop = node.scrollHeight;
				return node.scrollTop;
			});
			expect(scrolled).toBeGreaterThan(0);
			const pricing = sheet.getByRole("link", { name: "Plans and pricing" });
			await pricing.focus();

			await projects.click();
			await expect(sheet.getByRole("tabpanel")).not.toContainText("Plans and pricing");
			await plan.click();

			await expect(pricing).toBeFocused();
			expect(await sheet.getByRole("tabpanel").evaluate((node) => node.scrollTop)).toBe(scrolled);
		});

		await test.step("Escape closes the sheet and gives focus back to the trigger", async () => {
			await page.keyboard.press("Escape");
			await expect(sheet).toBeHidden();
			await expect(trigger).toBeFocused();
		});

		await test.step("Sign out in the foot signs out and leaves focus on Sign in", async () => {
			const again = await openAccountPanel(page, account);
			await again.getByRole("button", { name: "Sign out" }).click();
			await expect(again).toBeHidden();
			const signIn = page.getByRole("button", { name: "Sign in", exact: true });
			await expect(signIn).toBeVisible();
			await expect(signIn).toBeFocused();
		});
	});
});

test.describe("Hosted account sheet: where it sits on a desktop", () => {
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 1280, height: 800 },
	]) {
		test(`at ${viewport.width}x${viewport.height}, 440px wide over the island, nothing to scroll on Free's Plan`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport);
			const account = newAccount("sheet-room");
			await openStudio(page);
			await page.getByRole("button", { name: "Add scene" }).click();
			await signUpInIsland(page, account);
			const sheet = await openAccountPanel(page, account, "Plan");
			const panel = page.locator(".account-sheet");
			await settled(panel);

			const at = await box(panel);
			expect(at.width).toBe(440);
			expect(at.y + at.height).toBe(viewport.height);
			// The tallest common tab fits: Free's Plan, with the meter and the upgrade.
			const room = await sheet
				.getByRole("tabpanel")
				.evaluate((node) => node.scrollHeight - node.clientHeight);
			expect(room).toBeLessThanOrEqual(0);
			// Modal, under its scrim, as the hosted render sheet is: it covers the island and
			// the timeline and the frame's lower edge while it is open (decision log D2).
			const where = await placement(page);
			console.log(`${viewport.width}x${viewport.height}`, JSON.stringify(where));
			expect(where.sheet?.top).toBeLessThan(where.island?.top ?? 0);
		});
	}
});
