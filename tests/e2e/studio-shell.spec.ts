import { expect, openStudio, test } from "./support/studio";

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
