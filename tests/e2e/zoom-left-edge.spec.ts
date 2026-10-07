import type { Page } from "@playwright/test";
import { probeVideo } from "./support/media";
import { downloadFrom, expect, importHash, openStudio, test } from "./support/studio";

/**
 * Ticket #227: under the focus zoom, the window that cuts the 300-character
 * line lost its gutter and its first dozen columns off the left edge, cut
 * mid-glyph, in the preview and the PNG alike. A window that cuts a line now
 * pushes in from its left edge. The screenshots and the PNGs are the test's
 * attachments: their left edges are the proof the PR carries, and the ordinary
 * snippet's are compared to a build of `main`, pixel for pixel.
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

test.describe("The focus zoom on a window that cuts a long line", () => {
	test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

	test("pushes in from the left edge: the gutter and the line's start stay", async ({
		page,
	}, testInfo) => {
		await openZoomed(page, SOURCE);
		expect(await pivot(page)).toBeCloseTo(0, 2);
		// The first glyph of every line and the gutter's labels sit inside the window.
		const frame = page.locator("[data-export-target] .code-frame-glow");
		const windowLeft = (await frame.boundingBox())?.x ?? Number.NaN;
		const comment = page.locator("[data-export-target] span", { hasText: "// One line" }).first();
		expect((await comment.boundingBox())?.x).toBeGreaterThan(windowLeft);
		const label = page.locator("[data-export-target] div", { hasText: /^01$/ }).last();
		expect((await label.boundingBox())?.x).toBeGreaterThan(windowLeft);

		await page.getByTestId("preview-frame").screenshot({
			path: testInfo.outputPath("preview-long.png"),
		});
		const { path } = await savePng(page, testInfo.outputPath("export-long.png"));
		expect(probeVideo(path)).toMatchObject({ width: 1920, height: 1080 });
	});

	test("an ordinary snippet still pushes in from its centre", async ({ page }, testInfo) => {
		await openZoomed(page, ORDINARY);
		expect(await pivot(page)).toBeCloseTo(0.5, 2);
		await page.getByTestId("preview-frame").screenshot({
			path: testInfo.outputPath("preview-ordinary.png"),
		});
		await savePng(page, testInfo.outputPath("export-ordinary.png"));
	});
});
