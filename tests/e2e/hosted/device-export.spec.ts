import type { Page } from "@playwright/test";
import { edgeEnergy, probeVideo } from "../support/media";
import { downloadFrom, expect, openStudio, sceneCount, test } from "../support/studio";

/**
 * #265: a hosted build resolves the Free plan for a signed-out visitor, and the
 * Free plan used to clamp a device export to 1080p and stamp "Made with
 * Typelapse" on it. What runs on the visitor's machine is free (viability D2,
 * decision 2026-10-13-device-exports-free), so the hosted profile must hand
 * back the size that was asked for, with no mark the visitor did not write.
 *
 * The mark sits in the bottom-right corner of the frame (this is the box that
 * holds it at 3840x2160, wide enough for the longer branding line too). A
 * backdrop alone is smooth there; a line of text is not. The visitor's own
 * mark is the positive control: the same corner, measured the same way, must
 * show it.
 */
const CORNER = { x: 3072, y: 1996, width: 692, height: 80 };

async function renderAt4K(page: Page, path: string) {
	await page.getByRole("button", { name: /^Export · / }).click();
	await expect(page.getByRole("group", { name: "Format" })).toBeVisible();
	await page.getByRole("button", { name: "4K", exact: true }).click();
	return downloadFrom(page, () => page.getByRole("button", { name: /^Render · / }).click(), path);
}

test.describe("Hosted profile: a device export is the one that was asked for", () => {
	test("a signed-out 4K export comes out 3840x2160, and only the visitor's own mark is on it", async ({
		page,
	}, testInfo) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();

		let clean = 0;
		await test.step("no account, no mark: the size asked for, a bare corner", async () => {
			const { path } = await renderAt4K(page, testInfo.outputPath("plain.mp4"));
			expect(probeVideo(path)).toMatchObject({ codec: "h264", width: 3840, height: 2160 });
			clean = edgeEnergy(path, CORNER);
			testInfo.annotations.push({ type: "corner-edges-clean", description: clean.toFixed(2) });
		});

		await test.step("the visitor's own mark is drawn, and the measure can tell", async () => {
			await page.getByRole("button", { name: "Back to studio controls" }).click();
			await page.getByRole("button", { name: "Look settings" }).click();
			await page.getByRole("button", { name: "Watermark" }).click();
			await page.getByRole("textbox", { name: "Watermark" }).fill("@someone");
			await page.getByRole("button", { name: "Back to look controls" }).click();
			await page.getByRole("button", { name: "Back to studio controls" }).click();
			const { path } = await renderAt4K(page, testInfo.outputPath("marked.mp4"));
			expect(probeVideo(path)).toMatchObject({ width: 3840, height: 2160 });
			const marked = edgeEnergy(path, CORNER);
			testInfo.annotations.push({ type: "corner-edges-marked", description: marked.toFixed(2) });
			// A forced "Made with Typelapse" would have put text in the first
			// render's corner too; the gap between the two is its absence.
			expect(marked).toBeGreaterThan(0.5);
			expect(clean).toBeLessThan(marked / 10);
		});
	});
});
