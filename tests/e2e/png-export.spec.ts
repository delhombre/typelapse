import type { Page } from "@playwright/test";
import { probeVideo, rgbPixels } from "./support/media";
import { downloadFrom, expect, openStudio, sceneCount, test } from "./support/studio";

/**
 * Ticket #166: the PNG is a frame of the export at the preset's size, not a
 * crop of the window. It was 754x494 for "1080p 16:9" at a 1440x900 window, the
 * top-left of the code card on white, with no mesh behind it.
 *
 * The window is the one the bug was found at, and the file is read with ffprobe,
 * the way any viewer reads it: decoded dimensions, not what the store believes.
 */
async function savePng(page: Page, path: string) {
	await page.getByRole("button", { name: /^Export · / }).click();
	await expect(page.getByRole("group", { name: "Format" })).toBeVisible();
	return downloadFrom(
		page,
		() => page.getByRole("button", { name: "PNG", exact: true }).click(),
		path,
	);
}

test.describe("PNG export: a frame at the export's own size", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test.beforeEach(async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
	});

	test("1080p 16:9 is 1920x1080, with the backdrop behind the card", async ({ page }, testInfo) => {
		const { download, path } = await savePng(page, testInfo.outputPath("still-16x9.png"));
		await expect(page.getByRole("button", { name: "1080p", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(download.suggestedFilename()).toMatch(/\.png$/);
		expect(probeVideo(path)).toMatchObject({ width: 1920, height: 1080 });

		// The corner is the backdrop, not the page's white: the old file started on
		// the card's own top-left edge.
		const [red = 255, green = 255, blue = 255] = rgbPixels(path, 192, 108);
		expect(Math.max(red, green, blue)).toBeLessThan(200);
	});

	test("9:16 is 1080x1920: the aspect is the export's, not the window's", async ({
		page,
	}, testInfo) => {
		await page.getByRole("button", { name: /^Aspect ratio 16:9/ }).click();
		await page.getByRole("button", { name: "Aspect ratio 9:16", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Aspect ratio 9:16", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
		await page.getByRole("button", { name: "Back to studio controls" }).click();

		const { path } = await savePng(page, testInfo.outputPath("still-9x16.png"));
		expect(probeVideo(path)).toMatchObject({ width: 1080, height: 1920 });
	});
});
