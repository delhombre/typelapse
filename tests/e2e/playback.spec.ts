import type { Page } from "@playwright/test";
import { toneWav } from "./support/fixtures";
import { expect, openStudio, sceneCount, test } from "./support/studio";

/** The transport's readouts: where the playhead is, and what the video lasts. */
const clock = (page: Page) => page.locator(".studio-timeline-time").getByRole("status");
const total = (page: Page) => page.locator(".studio-timeline-total");

test.describe("Playback: the preview clock is the length of the video", () => {
	test("one scene plays to its end and stops there", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
		await expect(total(page)).toHaveText("00:01.0");

		await page.getByRole("button", { name: "Play timeline" }).click();
		await expect(page.getByRole("button", { name: "Pause timeline" })).toBeVisible();
		// It ends on its own: the button comes back and the clock reads the end.
		await expect(page.getByRole("button", { name: "Play timeline" })).toBeVisible({
			timeout: 5_000,
		});
		await expect(clock(page)).toHaveText("00:01.0");
	});

	test("loop adds the morph back to the first scene to the clock", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 2)).toBeVisible();
		// Two 1 s scenes and one 0.65 s morph.
		await expect(total(page)).toHaveText("00:02.6");

		await page.getByRole("button", { name: "Loop playback: off" }).click();
		await expect(page.getByRole("button", { name: "Loop playback: on" })).toBeVisible();
		await expect(
			page.getByRole("img", { name: /^Loop: scene 2 morphs back to scene 1, 0\.65 seconds$/ }),
		).toBeVisible();
		await expect(total(page)).toHaveText("00:03.3");
	});

	test("an audio cue longer than the scenes extends the clock to its end", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(total(page)).toHaveText("00:01.0");

		await page.getByRole("button", { name: "Add source" }).click();
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("menuitem", { name: "Add audio" }).click();
		await (await chooser).setFiles({
			name: "tone.wav",
			mimeType: "audio/wav",
			buffer: toneWav(3),
		});
		// Past the last scene the last frame holds until the audio ends.
		await expect(total(page)).toHaveText("00:03.0");
	});
});
