import type { Page } from "@playwright/test";
import { probeVideo } from "./support/media";
import { downloadFrom, expect, importHash, openStudio, test } from "./support/studio";

/**
 * Ticket #227: under the focus zoom, the window that cuts the 300-character
 * line lost its gutter and its first dozen columns off the left edge, cut
 * mid-glyph, in the preview and the PNG alike; an ordinary snippet lost its
 * gutter. The push-in now pivots left of centre only as far as keeps half the
 * margin before the gutter, and fades the right. The screenshots and the PNGs are the
 * test's attachments: their edges are the proof the PR carries.
 */

const LONG = `const message = "${"lorem ipsum dolor sit amet ".repeat(11).slice(0, 281)}";`;
const SOURCE = ["// One line far longer than any window.", LONG, "export default message;"].join(
	"\n",
);
const ORDINARY = ["export function greet(name: string) {", "  return `Hello, ${name}!`;", "}"].join(
	"\n",
);

/** The repro: the paste imported, "2" focused on scene 1, Focus zoom on. */
async function openZoomed(page: Page, source: string) {
	await openStudio(page, importHash(source));
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	const focus = page.getByLabel("Scene 1 focus lines");
	await focus.fill("2");
	await focus.press("Enter");
	await expect(focus).toHaveValue("2");
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await page.getByRole("button", { name: "Motion settings" }).click();
	const zoom = page.getByRole("button", { name: /^(Focus )?zoom$/i });
	await zoom.click();
	await expect(zoom).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Back to studio controls" }).click();
}

/** The pushed-in box, and where it pivots across its own width (0 left, 0.5 centre). */
async function pivot(page: Page) {
	const scaled = page.locator("[data-export-target] div[style*='scale(1.25)']").first();
	await expect(scaled).toBeAttached();
	return scaled.evaluate((el) => {
		const [x = "0"] = getComputedStyle(el).transformOrigin.split(" ");
		return Number.parseFloat(x) / Number.parseFloat(getComputedStyle(el).width);
	});
}

async function savePng(page: Page, path: string) {
	await page.getByRole("button", { name: /^Export · / }).click();
	await expect(page.getByRole("group", { name: "Format" })).toBeVisible();
	return downloadFrom(
		page,
		() => page.getByRole("button", { name: "PNG", exact: true }).click(),
		path,
	);
}

/** The left edges of the window, `text`'s first glyph and the gutter's "01", in page px. */
async function leftEdges(page: Page, text: string) {
	const left = async (locator: ReturnType<Page["locator"]>) =>
		(await locator.boundingBox())?.x ?? Number.NaN;
	return {
		window: await left(page.locator("[data-export-target] .code-frame-glow")),
		line: await left(page.locator("[data-export-target] span", { hasText: text }).first()),
		gutter: await left(page.locator("[data-export-target] div", { hasText: /^01$/ }).last()),
		/** The window's padding as drawn, from the code body's own style. */
		margin: await page
			.locator("[data-export-target] div[style*='scale(1.25)'] > div")
			.first()
			.evaluate((el) => {
				// Page px per layout px, read off the unscaled clip box: the margin at rest.
				const clip = el.parentElement?.parentElement as HTMLElement;
				const unit = clip.getBoundingClientRect().width / clip.offsetWidth;
				return Number.parseFloat(getComputedStyle(el).paddingLeft) * unit;
			}),
	};
}

test.describe("The focus zoom keeps half the margin before the gutter", () => {
	test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

	// The pivot `zoomOriginX` gives each window: the padding the push-in draws
	// over the width it crops (greet is 37 columns; the long line is cut at 185).
	for (const { name, source, first, origin } of [
		{ name: "long", source: SOURCE, first: "// One line", origin: 0.044 },
		{ name: "ordinary", source: ORDINARY, first: "export", origin: 0.1772 },
	]) {
		test(`the ${name} snippet keeps its gutter and its line starts, and fades its right edge`, async ({
			page,
		}, testInfo) => {
			await openZoomed(page, source);
			const measured = await pivot(page);
			testInfo.annotations.push({ type: "pivot", description: String(measured) });
			// About the rule's figure: the real font's widest line can differ by a cell.
			expect(Math.abs(measured - origin)).toBeLessThan(0.01);
			const edges = await leftEdges(page, first);
			// The gutter's left edge stays half a margin inside the window's edge.
			expect(edges.gutter - edges.window).toBeGreaterThan(edges.margin / 2 - 0.5);
			expect(edges.line).toBeGreaterThan(edges.gutter);
			// One fade on the right edge: the window's own on the cut line, the push-in's otherwise.
			const fades = page.locator(
				"[data-export-target] [data-clip-fade='right'], [data-export-target] [data-push-in-fade]",
			);
			await expect(fades).toHaveCount(1);
			const own = page.locator(
				name === "long"
					? "[data-export-target] [data-clip-fade='right']"
					: "[data-export-target] [data-push-in-fade]",
			);
			await expect(own).toHaveCount(1);
			await expect(own).toHaveCSS("opacity", "1");

			await page.getByTestId("preview-frame").screenshot({
				path: testInfo.outputPath(`preview-${name}.png`),
			});
			const { path } = await savePng(page, testInfo.outputPath(`export-${name}.png`));
			expect(probeVideo(path)).toMatchObject({ width: 1920, height: 1080 });
		});
	}
});
