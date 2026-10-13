import { type Locator, type Page, devices } from "@playwright/test";
import { expect, openStudio, sceneCount, test } from "./support/studio";

/**
 * The capture library: what this device kept of the exports, in a sheet as wide
 * as they are. On a desktop the sheet is a centred card sized to its captures
 * (a floor for the empty state, a ceiling of three columns); on a phone it is
 * the screen's width, as a bottom sheet is. Its empty state says what a capture
 * is and how to make one, and its action opens the export panel.
 */

async function openLibrary(page: Page, tap = false): Promise<Locator> {
	// A finger finds the library in the More menu, a cursor in the corner row.
	if (tap) {
		await page.getByRole("button", { name: "More actions" }).tap();
	}
	const trigger = page.getByRole("button", { name: "Library", exact: true });
	await (tap ? trigger.tap() : trigger.click());
	const dialog = page.getByRole("dialog", { name: "Capture library" });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** Where the sheet's box sits, once the dialog is open (the entrance moves it, never resizes it). */
async function sheetBox(page: Page) {
	const box = await page.locator(".studio-sheet-panel").boundingBox();
	if (!box) throw new Error("the sheet has no box");
	return box;
}

/**
 * The width a sheet should have to be sized to what it holds: the first row of its
 * cards, its two side gutters and whatever the scrollbar takes. Read from the page,
 * so the check follows the design's numbers instead of repeating them.
 */
async function widthOfFirstRow(page: Page, cards: string, grid: string): Promise<number> {
	return page.evaluate(
		({ cards, grid }) => {
			const rects = [...document.querySelectorAll(cards)].map((card) =>
				card.getBoundingClientRect(),
			);
			const top = rects[0]?.top ?? 0;
			const row = rects.filter((rect) => Math.abs(rect.top - top) < 1);
			const span =
				Math.max(...row.map((rect) => rect.right)) - Math.min(...row.map((rect) => rect.left));
			const panel = document.querySelector(".studio-sheet-panel") as HTMLElement;
			const gridElement = document.querySelector(grid) as HTMLElement;
			const gutter = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--sheet-inline"));
			const scrollbar = gridElement.offsetWidth - gridElement.clientWidth;
			return span + 2 * gutter + scrollbar;
		},
		{ cards, grid },
	);
}

/** How many captures the studio kept, read from the library's own IndexedDB store. */
function storedCaptures(page: Page): Promise<number> {
	return page.evaluate(async () => {
		// Opening a database that does not exist yet would create it without its store.
		const known = await indexedDB.databases();
		if (!known.some((entry) => entry.name === "typelapse-captures")) return 0;
		return new Promise<number>((resolve) => {
			const request = indexedDB.open("typelapse-captures", 1);
			request.onerror = () => resolve(0);
			request.onsuccess = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("captures")) return resolve(0);
				const count = db.transaction("captures").objectStore("captures").count();
				count.onsuccess = () => {
					db.close();
					resolve(count.result);
				};
			};
		});
	});
}

/** Keeps `count` more captures: each is one press of PNG in the export panel. */
async function keepCaptures(page: Page, count: number) {
	let kept = await storedCaptures(page);
	if (kept === 0) {
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
	}
	// A press outside the island (the Library button) closes its panel, so the panel
	// is opened again unless it is already there.
	const exportButton = page.getByRole("button", { name: /^Export · / });
	const format = page.getByRole("group", { name: "Format" });
	await expect(exportButton.or(format)).toBeVisible();
	if (!(await format.isVisible())) {
		await exportButton.click();
		await expect(format).toBeVisible();
	}
	for (let made = 0; made < count; made++) {
		await page.getByRole("button", { name: "PNG", exact: true }).click();
		kept += 1;
		await expect.poll(() => storedCaptures(page)).toBe(kept);
	}
}

test.describe("Capture library on a desktop: a sheet sized to its captures", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test(
		"empty, it says what a capture is, and its action opens the export panel",
		{ tag: "@smoke" },
		async ({ page }) => {
			await openStudio(page);
			const dialog = await openLibrary(page);

			await expect(
				dialog.getByText("Export a PNG, GIF, MP4 or WebM and it is kept here as a capture."),
			).toBeVisible();

			// A card, not the window: centred, with paper on both sides.
			const box = await sheetBox(page);
			expect(box.width).toBeGreaterThan(300);
			expect(box.width).toBeLessThan(700);
			expect(Math.abs(box.x - (1440 - box.x - box.width))).toBeLessThanOrEqual(1);

			await dialog.getByRole("button", { name: "Export", exact: true }).click();
			await expect(dialog).toBeHidden();
			await expect(page.getByRole("group", { name: "Format" })).toBeVisible();
			// The panel is asked for once the sheet is gone: the page behind a modal dialog
			// cannot take focus, and the hand-off must land on the panel's way back.
			await expect(page.getByRole("button", { name: "Back to studio controls" })).toBeFocused();
		},
	);

	test("the sheet grows with its captures, to three columns, and stays centred", async ({
		page,
	}) => {
		await openStudio(page);

		const widths: number[] = [];
		for (const kept of [1, 2, 3, 4]) {
			await keepCaptures(page, 1);
			const dialog = await openLibrary(page);
			await expect(dialog.getByRole("article")).toHaveCount(kept);
			const box = await sheetBox(page);
			widths.push(box.width);
			expect(Math.abs(box.x - (1440 - box.x - box.width))).toBeLessThanOrEqual(1);
			// Sized to its content: the sheet is as wide as its first row of cards and gutters.
			const content = await widthOfFirstRow(page, ".capture-card", ".capture-library-grid");
			expect(Math.abs(box.width - content)).toBeLessThanOrEqual(1);
			await page.keyboard.press("Escape");
			await expect(dialog).toBeHidden();
		}

		const [one, two, three, four] = widths as [number, number, number, number];
		expect(one).toBeLessThan(two);
		expect(two).toBeLessThan(three);
		// A fourth capture is a second row, not a fourth column.
		expect(four).toBe(three);
		expect(three).toBeLessThan(1440 - 2 * 24);
	});

	// The grid used to be a shrinkable flex item whose rows could shrink to nothing, so
	// once the cards needed more than the sheet's height each was squeezed to a share
	// of it and its footer (the title, the size and the download) was clipped away.
	test("more rows than the sheet can hold scroll, and no card is squeezed", async ({ page }) => {
		await openStudio(page);
		await keepCaptures(page, 4);
		await page.setViewportSize({ width: 1440, height: 400 });
		const dialog = await openLibrary(page);

		const grid = dialog.locator(".capture-library-grid");
		await expect(dialog.getByRole("article")).toHaveCount(4);
		const squeezed = await dialog
			.getByRole("article")
			.evaluateAll(
				(cards) => cards.filter((card) => card.scrollHeight > card.clientHeight + 1).length,
			);
		expect(squeezed).toBe(0);
		const { scrolls, last } = await grid.evaluate((element) => ({
			scrolls: element.scrollHeight > element.clientHeight + 1,
			last: element.lastElementChild?.getBoundingClientRect().bottom ?? 0,
		}));
		expect(scrolls).toBe(true);
		// The last card is below the sheet's edge until it is scrolled to.
		expect(last).toBeGreaterThan(400);
		await expect(dialog.getByRole("button", { name: /^Download / }).first()).toBeVisible();
	});
});

test.describe("Capture library on a phone: the sheet is the screen's width", () => {
	const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
	test.use({ ...phone, viewport: { width: 390, height: 844 } });

	test("empty, it spans the screen and says the same sentence", async ({ page }) => {
		await openStudio(page);
		const dialog = await openLibrary(page, true);

		await expect(
			dialog.getByText("Export a PNG, GIF, MP4 or WebM and it is kept here as a capture."),
		).toBeVisible();
		const box = await sheetBox(page);
		expect(box.x).toBe(0);
		expect(box.width).toBe(390);
	});

	// The phone's drawer claims Escape on the document, which also stopped the dialog's own
	// close: a hardware keyboard could open the library and not leave it.
	test("Escape closes it", async ({ page }) => {
		await openStudio(page);
		const dialog = await openLibrary(page, true);

		await page.keyboard.press("Escape");

		await expect(dialog).toBeHidden();
	});
});
