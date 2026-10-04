import type { Page } from "@playwright/test";
import { GIF_MAX_EDGE } from "../../src/infrastructure/export/gif-quality";
import { GIF_MAX_FPS } from "../../src/infrastructure/export/gif-timing";
import { encodingFor, encodingQuality } from "../../src/infrastructure/export/video-encoding";
import { meanAbsoluteError, probeVideo, rgbPixels } from "./support/media";
import { downloadFrom, expect, openStudio, sceneCount, test } from "./support/studio";

/**
 * Size of the comparison. Area-averaging a 1920 frame and a preview screenshot
 * down to 480x270 keeps the layout, the colours and the code block, and drops
 * the sub-pixel glyph anti-aliasing where the DOM and the canvas painter
 * legitimately differ.
 */
const COMPARE_WIDTH = 480;
const COMPARE_HEIGHT = 270;

/**
 * The WYSIWYG tolerance, in mean absolute difference per channel (0..255),
 * measured on this journey (2026-10-04, Chromium 151): the preview against
 * frame 0 of its own MP4 is 3.08, identical over repeated runs (H.264 at
 * 4:2:0, the preview frame's rounded corners, two text rasterizers). The same
 * preview against an export with the code card missing is 20.8, with another
 * backdrop 84, against black 79. The mesh drifts with the clock, so the frame
 * is compared at the instant the preview shows (0 s): 0.9 s later the same
 * export already reads 8.3. 8 passes the codec and fails a lost layer.
 */
const WYSIWYG_TOLERANCE = 8;

async function openExportPanel(page: Page) {
	await page.getByRole("button", { name: /^Export · / }).click();
	await expect(page.getByRole("group", { name: "Format" })).toBeVisible();
}

async function render(page: Page, path: string) {
	return downloadFrom(page, () => page.getByRole("button", { name: /^Render · / }).click(), path);
}

test.describe("Device export: the file on disk is the video the preview shows", () => {
	test.beforeEach(async ({ page }) => {
		await openStudio(page);
		// One captured scene of the default snippet: 1 s, held, no transition.
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
	});

	test(
		"MP4 1080p60 is H.264, 1920x1080, 60 fps, one second, and matches the preview",
		{
			tag: "@smoke",
		},
		async ({ page }, testInfo) => {
			const preview = testInfo.outputPath("preview.png");
			await page.evaluate(() => document.fonts.ready);
			await page.getByTestId("preview-frame").screenshot({ path: preview });

			await openExportPanel(page);
			await expect(page.getByRole("button", { name: "MP4", exact: true })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			await expect(page.getByRole("button", { name: "1080p", exact: true })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			await expect(page.getByRole("button", { name: "60", exact: true })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			const { download, path } = await render(page, testInfo.outputPath("export.mp4"));
			expect(download.suggestedFilename()).toMatch(/\.mp4$/);

			const probe = probeVideo(path);
			expect(probe).toMatchObject({ codec: "h264", width: 1920, height: 1080, fps: 60 });
			// One scene of one second; a frame of slack for container rounding.
			expect(probe.durationSeconds).toBeGreaterThan(1 - 1 / 60 - 0.001);
			expect(probe.durationSeconds).toBeLessThan(1 + 1 / 60 + 0.001);
			// A real picture, not an empty track: 1080p60 of code is never under 50 kB.
			expect(probe.sizeBytes).toBeGreaterThan(50_000);

			const frame = rgbPixels(path, COMPARE_WIDTH, COMPARE_HEIGHT, 0);
			const shown = rgbPixels(preview, COMPARE_WIDTH, COMPARE_HEIGHT);
			const difference = meanAbsoluteError(frame, shown);
			testInfo.annotations.push({ type: "wysiwyg-mae", description: difference.toFixed(2) });
			expect(difference).toBeLessThan(WYSIWYG_TOLERANCE);
		},
	);

	test("WebM is AV1 when the browser encodes AV1, VP9 otherwise", async ({ page }, testInfo) => {
		// The app walks this ladder and takes the first rung the browser accepts;
		// the journey asks the same browser the same question.
		const ladder = encodingFor("webm", 1920, 1080, 60).ladder.map((rung) => ({
			codec: rung.codec,
			codecString: rung.codecString,
			bitrate: encodingQuality(rung.codec, 1920, 1080, 60).bitrate,
		}));
		const expected = await page.evaluate(async (rungs) => {
			for (const rung of rungs) {
				const support = await VideoEncoder.isConfigSupported({
					codec: rung.codecString,
					width: 1920,
					height: 1080,
					framerate: 60,
					bitrate: rung.bitrate,
				}).catch(() => ({ supported: false }));
				if (support.supported) return rung.codec;
			}
			return null;
		}, ladder);
		expect(expected === "av1" || expected === "vp9").toBe(true);

		await openExportPanel(page);
		await page.getByRole("button", { name: "WebM", exact: true }).click();
		const { path } = await render(page, testInfo.outputPath("export.webm"));
		const probe = probeVideo(path);
		testInfo.annotations.push({ type: "webm-codec", description: probe.codec });
		expect(probe).toMatchObject({ codec: expected, width: 1920, height: 1080 });
		expect(probe.durationSeconds).toBeCloseTo(1, 1);
	});

	test("GIF is capped at its edge and frame rate", async ({ page }, testInfo) => {
		await openExportPanel(page);
		await page.getByRole("button", { name: "GIF", exact: true }).click();
		const { path } = await render(page, testInfo.outputPath("export.gif"));
		const probe = probeVideo(path);
		expect(probe.codec).toBe("gif");
		// 1080p asked, the GIF cap answered: the long edge at the cap, 16:9 kept.
		expect(Math.max(probe.width, probe.height)).toBe(GIF_MAX_EDGE);
		expect(probe.width / probe.height).toBeCloseTo(16 / 9, 2);
		// 60 fps asked, at most the GIF cap delivered.
		expect(probe.fps).toBeLessThanOrEqual(GIF_MAX_FPS);
		expect(probe.durationSeconds).toBeCloseTo(1, 1);
	});
});
