import type { Page } from "@playwright/test";
import { expect, openStudio, settled, test } from "./support/studio";

/**
 * The desktop shell itself: the paper never slides under the controls, and the
 * inspector's words stay readable on the dark side.
 */
test.describe("Studio shell: the scene stays put and stays legible", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("an open card never lets the studio scroll sideways", async ({ page }) => {
		await openStudio(page);
		const edit = page.getByRole("button", { name: "Edit", exact: true });
		if ((await edit.getAttribute("aria-pressed")) !== "true") await edit.click();
		await page.getByRole("button", { name: "Add scene" }).click();

		// The stage and the dock overhang the window while the card is open. A
		// scroll container would let focus, find-in-page or any scrollIntoView
		// slide the whole studio left, under its own header.
		const scrollLeft = await page.locator("main.studio-root").evaluate((root) => {
			root.scrollLeft = 200;
			return root.scrollLeft;
		});
		expect(scrollLeft).toBe(0);
	});

	// DECISIONS D5, next-wave D6: a menu that holds rows of text is the opaque studio surface in
	// both shells. The phone shows the stage through it, the desktop shows the mesh through the
	// popover that asks the replace question; neither does now.
	for (const theme of ["light", "dark"] as const) {
		test(`the menus that hold text are opaque on the desktop too, ${theme}`, async ({ page }) => {
			await page.addInitScript(
				(mode) => window.localStorage.setItem("typelapse.studio-theme", mode),
				theme,
			);
			await openStudio(page);
			const paint = (selector: string) =>
				page.locator(selector).evaluate((element) => {
					const style = getComputedStyle(element);
					const slash = style.backgroundColor.match(/\/\s*([\d.]+)(%?)\s*\)/);
					const alpha = slash ? Number(slash[1]) / (slash[2] ? 100 : 1) : 1;
					return { alpha, blur: style.backdropFilter };
				});

			await page.locator(".sc-project-trigger").click();
			await expect(page.locator(".sc-project-menu")).toBeVisible();
			expect(await paint(".sc-project-menu")).toEqual({ alpha: 1, blur: "none" });

			await page.getByRole("button", { name: "Add source" }).click();
			await expect(page.locator(".sc-source-menu")).toBeVisible();
			expect(await paint(".sc-source-menu")).toEqual({ alpha: 1, blur: "none" });

			await page.getByRole("menuitem", { name: "Import from URL" }).click();
			await expect(page.locator(".sc-source-form-popover")).toBeVisible();
			expect(await paint(".sc-source-form-popover")).toEqual({ alpha: 1, blur: "none" });
		});
	}

	test("a layer's fields are written in light ink on the dark theme", async ({ page }) => {
		await page.addInitScript(() => window.localStorage.setItem("typelapse.studio-theme", "dark"));
		await openStudio(page);
		const edit = page.getByRole("button", { name: "Edit", exact: true });
		if ((await edit.getAttribute("aria-pressed")) !== "true") await edit.click();
		await page.getByRole("button", { name: "Blank", exact: true }).first().click();
		await page.getByRole("button", { name: "Text", exact: true }).click();

		const ink = await page
			.getByRole("textbox", { name: "Text layer content" })
			.evaluate((field) => getComputedStyle(field).color);
		const [red = 0, green = 0, blue = 0] = ink.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
		expect(red + green + blue).toBeGreaterThan(600);
	});
});

/**
 * The rail's island springs its width to the row it holds and clips that row while
 * it does. A spring that overshoots a narrower row closes on its last control, the
 * export pill, for as long as it takes to settle (pass 2026-10-05-export-and-islands).
 */
test.describe("Studio rail: the island settles without closing on its row", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	/** Frame by frame through `action`: how far the island's right edge stands past the end of its row. */
	async function watchIsland(page: Page, action: () => Promise<void>) {
		await page.evaluate(() => {
			const island = document.querySelector<HTMLElement>(".si-island");
			if (!island) throw new Error("the island is not on the page");
			const style = getComputedStyle(island);
			const frames: number[] = [];
			let last = island.getBoundingClientRect().width;
			let moved = false;
			let still = 0;
			const done = new Promise<void>((resolve) => {
				const tick = () => {
					const width = island.getBoundingClientRect().width;
					const row = [...island.querySelectorAll<HTMLElement>(".si-row")].at(-1);
					if (row) frames.push(width - (Number.parseFloat(style.paddingLeft) + row.offsetWidth));
					if (Math.abs(width - last) > 0.5) moved = true;
					still = moved && Math.abs(width - last) < 0.01 ? still + 1 : 0;
					last = width;
					if (still >= 20) resolve();
					else requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			Object.assign(window, { __island: { frames, done, paddingRight: style.paddingRight } });
		});
		await action();
		return page.evaluate(async () => {
			const watch = (
				window as unknown as {
					__island: { frames: number[]; done: Promise<void>; paddingRight: string };
				}
			).__island;
			await watch.done;
			return { frames: watch.frames, paddingRight: Number.parseFloat(watch.paddingRight) };
		});
	}

	test("coming back from the widest row, it never gets narrower than the row", async ({ page }) => {
		await openStudio(page);
		const rail = page.locator(".si-island");
		await page.locator(".si-cta").click();
		await expect(page.getByRole("button", { name: "Back to studio controls" })).toBeVisible();
		await settled(rail);

		const { frames } = await watchIsland(page, () =>
			page.getByRole("button", { name: "Back to studio controls" }).click(),
		);
		// Negative is the island's edge inside its row: the last control is being cut.
		expect(Math.min(...frames)).toBeGreaterThanOrEqual(0);
	});

	test("at rest the row ends where the island's padding says, whichever row it holds", async ({
		page,
	}) => {
		await openStudio(page);
		const rail = page.locator(".si-island");
		for (const open of [
			() => page.getByRole("button", { name: "Look settings" }).click(),
			() => page.getByRole("button", { name: "Back to studio controls" }).click(),
			() => page.getByRole("button", { name: /^Social preview/ }).click(),
		]) {
			const { frames, paddingRight } = await watchIsland(page, open);
			await settled(rail);
			expect(frames.at(-1)).toBeCloseTo(paddingRight, 0);
		}
	});
});
