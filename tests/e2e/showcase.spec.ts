import { expect, openStudio, test } from "./support/studio";

/**
 * The showcase's six cards. Each rests on a static poster of its project's last
 * frame and, once a card is explored, plays the real morph over it: the poster
 * has to be a clean first read and then give way, or two frames of code print
 * over each other.
 */
test.describe("Showcase: a card's poster reads cleanly and gives way to its preview", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	async function openShowcase(page: Parameters<typeof openStudio>[0]) {
		await openStudio(page);
		await page.getByRole("button", { name: "Showcase", exact: true }).click();
		const card = page.locator(".showcase-card").first();
		// The poster starts as plain lines and takes its syntax colour once the
		// highlighter lands; the geometry must not change when it does.
		await expect(card.locator(".showcase-static-code pre.shiki")).toBeVisible();
		return card;
	}

	test("the poster's lines are one leading apart, not two", async ({ page }) => {
		const card = await openShowcase(page);
		const poster = card.locator(".showcase-static-code");
		const { leading, pitch } = await poster.evaluate((element) => {
			const lines = [...element.querySelectorAll(".line")];
			const first = lines[0]?.getBoundingClientRect().top ?? 0;
			const second = lines[1]?.getBoundingClientRect().top ?? 0;
			return {
				leading: Number.parseFloat(getComputedStyle(element).lineHeight),
				pitch: second - first,
			};
		});
		// Shiki puts a newline text node between its line spans; inside a block each
		// one drew a blank line, so the poster ran at double leading.
		expect(pitch).toBeGreaterThan(leading - 0.5);
		expect(pitch).toBeLessThan(leading + 0.5);
	});

	test("the poster steps aside once the card plays its own frames", async ({ page }) => {
		const card = await openShowcase(page);
		await card.hover();
		await expect(card.locator(".showcase-live-code[data-looping-ready]")).toBeAttached();
		await expect(card.locator(".showcase-static-code")).toHaveCSS("opacity", "0");
		await page.mouse.move(2, 2);
		await expect(card.locator(".showcase-live-code")).toHaveCount(0);
		await expect(card.locator(".showcase-static-code")).toHaveCSS("opacity", "1");
	});
});

/**
 * The showcase shares the capture library's sheet: on a desktop it is as wide as its
 * two columns of cards, centred, not the width of the window.
 */
test.describe("Showcase: a sheet as wide as its two columns", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("two projects across, centred, with paper on both sides", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Showcase", exact: true }).click();
		const cards = page.locator(".showcase-card");
		await expect(cards).toHaveCount(6);

		const boxes = await cards.evaluateAll((elements) =>
			elements.slice(0, 3).map((element) => {
				const { left, right, top } = element.getBoundingClientRect();
				return { left, right, top };
			}),
		);
		const [first, second, third] = boxes as [
			(typeof boxes)[number],
			(typeof boxes)[number],
			(typeof boxes)[number],
		];
		// Two to a row: the second card beside the first, the third under it.
		expect(Math.abs(second.top - first.top)).toBeLessThan(1);
		expect(third.top).toBeGreaterThan(first.top + 100);

		const panel = await page.locator(".studio-sheet-panel").boundingBox();
		if (!panel) throw new Error("the sheet has no box");
		const gutter = await page
			.locator(".studio-sheet-panel")
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).getPropertyValue("--sheet-inline")),
			);
		const grid = page.locator(".showcase-grid");
		const scrollbar = await grid.evaluate((element) => {
			const box = element as HTMLElement;
			return box.offsetWidth - box.clientWidth;
		});
		expect(
			Math.abs(panel.width - (second.right - first.left + 2 * gutter + scrollbar)),
		).toBeLessThanOrEqual(1);
		expect(panel.width).toBeLessThan(1440 - 2 * 24);
		expect(Math.abs(panel.x - (1440 - panel.x - panel.width))).toBeLessThanOrEqual(1);
	});
});
