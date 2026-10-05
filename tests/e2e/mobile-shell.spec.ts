import { devices } from "@playwright/test";
import { quadrantPng } from "./support/fixtures";
import { addSource, expect, openStudio, test } from "./support/studio";

// A phone: 390 px wide, touch, a mobile user agent. Chromium only, like the rest.
const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
test.use({ ...phone, viewport: { width: 390, height: 844 } });

test.describe("Mobile shell: the studio works with a thumb at 390 px", () => {
	test("capture, drop a photo, go back to the code, undo the photo", async ({ page }) => {
		await openStudio(page);
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await expect(sheet).toBeVisible();
		await expect(page.getByRole("region", { name: "Studio resources" })).toBeVisible();

		// Raise the sheet to the scenes stop, then capture the live code.
		await page.locator("[data-vaul-handle]").tap();
		await sheet.getByRole("button", { name: "Capture", exact: true }).tap();
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();

		// A photo dropped anywhere lands in the selected scene.
		const dataTransfer = await page.evaluateHandle((base64) => {
			const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
			const transfer = new DataTransfer();
			transfer.items.add(new File([bytes], "quadrants.png", { type: "image/png" }));
			return transfer;
		}, quadrantPng().toString("base64"));
		const stage = page.locator(".sc-stage");
		await stage.dispatchEvent("dragenter", { dataTransfer });
		await stage.dispatchEvent("dragover", { dataTransfer });
		await stage.dispatchEvent("drop", { dataTransfer });
		await expect(page.getByRole("button", { name: "Edit image layer" })).toBeVisible();

		// The dropped photo is picked: its inspector takes the code's place in the
		// sheet, and the Code chip is the way back.
		await expect(sheet.getByRole("button", { name: "quadrants.png", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toBeVisible();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toHaveCount(0);
		await sheet.getByRole("button", { name: "Code", exact: true }).tap();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toBeAttached();
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toHaveCount(0);

		// Undo takes the photo back out.
		await page.getByRole("button", { name: "Undo" }).tap();
		await expect(page.getByRole("button", { name: "Edit image layer" })).toHaveCount(0);
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();
	});

	// A hidden box is still a scroll container, and a clipped one is not (DECISIONS D15):
	// on a phone a focus or a scrollIntoView must not be able to slide the studio
	// under its own corner row either.
	test("the root clips and never scrolls, even with something hanging off its edge", async ({
		page,
	}) => {
		await openStudio(page);
		const scrollLeft = await page.locator("main.studio-root").evaluate((root) => {
			const overhang = document.createElement("div");
			overhang.style.cssText = "position:absolute;top:0;left:100%;width:200px;height:10px";
			root.append(overhang);
			root.scrollLeft = 200;
			const moved = root.scrollLeft;
			overhang.remove();
			return moved;
		});
		expect(scrollLeft).toBe(0);
	});

	// The phone root once carried a few of the desktop's colour tokens and none of its
	// material, so the project menu painted no background at all: the stage showed
	// through its rows. Every menu on the root reads the same material.
	test("a menu paints the studio's material, not the stage behind it", async ({ page }) => {
		await openStudio(page);
		await page.locator(".sc-project-trigger").tap();
		const menu = page.locator(".sc-project-menu");
		await expect(menu).toBeVisible();
		const fill = await menu.evaluate((element) => getComputedStyle(element).backgroundColor);
		expect(fill).not.toBe("rgba(0, 0, 0, 0)");
		const shadow = await menu.evaluate((element) => getComputedStyle(element).boxShadow);
		expect(shadow).not.toBe("none");
	});

	// The Showcase's replace question holds a picture, two paragraphs and a card of
	// its own. On a short phone the sheet is 74% of the screen, and the block was
	// clipped by it with nothing a finger could scroll: "Open example" sat below the
	// fold, out of reach. (A hidden box scrolls for a script, not for a thumb, so the
	// check reads what clips and whether anything between the button and the sheet
	// is a scroller. Reduced motion keeps the entrance's own offsets out of the
	// measure.)
	test("a short phone can still answer the Showcase's replace question", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 375, height: 600 });
		await openStudio(page);
		await addSource(page, "Add text");
		await page.getByRole("button", { name: "Showcase", exact: true }).tap();
		await page.locator(".showcase-card").first().tap();

		const open = page.getByRole("button", { name: "Open example" });
		await expect(open).toBeVisible();
		const confirm = await page.locator(".showcase-confirm").evaluate((element) => ({
			overflows: element.scrollHeight > element.clientHeight + 1,
			overflowY: getComputedStyle(element).overflowY,
		}));
		expect(confirm).toEqual({ overflows: true, overflowY: "auto" });

		const clippers = await open.evaluate((button) => {
			const found: string[] = [];
			for (let el = button.parentElement; el; el = el.parentElement) {
				const overflow = getComputedStyle(el).overflowY;
				if (
					(overflow === "hidden" || overflow === "clip") &&
					el.scrollHeight > el.clientHeight + 1
				) {
					found.push(`${el.className}: ${overflow}`);
				}
				if (el.matches(".studio-sheet-panel")) break;
			}
			return found;
		});
		expect(clippers).toEqual([]);
	});
});
