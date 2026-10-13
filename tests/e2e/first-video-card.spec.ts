import { downloadFrom, expect, openStudio, test } from "./support/studio";

/**
 * The First video card (#251) walks a first-time visitor to a first video:
 * capture a scene, add a focus or a caption, render. Here it is followed all
 * the way, with a real MP4 rendered on the device, and then across a reload.
 */
test.describe("The First video card", () => {
	test("ticks 1, 2, 3 as the visitor captures, captions and renders, then is gone on the next load", async ({
		page,
	}, testInfo) => {
		await openStudio(page);
		const card = page.getByRole("group", { name: "First video" });
		// On an empty project the fork says to capture; the card would only repeat it.
		await expect(page.getByRole("button", { name: "Capture this code" })).toBeVisible();
		await expect(card).toHaveCount(0);

		// Capture is the fork's one filled button: the card appears as earned progress.
		await page.getByRole("button", { name: "Capture this code" }).click();
		await expect(card).toContainText("1 of 3");
		await expect(card).toContainText("Add a focus or a caption");

		// The step line is a link to the scene's own fields.
		await card.getByRole("button", { name: "Add a focus or a caption" }).click();
		await expect(page.getByRole("textbox", { name: "Focus lines" })).toBeFocused();
		// A caption is committed on Enter or blur, and the card ticks on the commit.
		await page.getByRole("textbox", { name: "Caption" }).fill("Why this runs first");
		await page.getByRole("textbox", { name: "Caption" }).press("Enter");
		await expect(card).toContainText("2 of 3");
		await expect(card).toContainText("Render");

		await page.getByRole("button", { name: /^Export · / }).click();
		await downloadFrom(
			page,
			() => page.getByRole("button", { name: /^Render · / }).click(),
			testInfo.outputPath("first.mp4"),
		);
		await expect(card).toContainText("3 of 3");
		await expect(card).toContainText("Your first video is made.");
		// Completed, it offers one way to put it away; otherwise it is gone on the next load.
		await expect(card.getByRole("button")).toHaveCount(1);
		await expect(card.getByRole("button", { name: "Done" })).toBeVisible();

		// The load after the completion: a project with a scene opens in Preview, so
		// open Edit and see that the panel is there and the card is not.
		await page.reload();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		await page.getByRole("button", { name: "Edit", exact: true }).click();
		await expect(page.getByText("Scene 1 of 1")).toBeVisible();
		await expect(page.getByRole("group", { name: "First video" })).toHaveCount(0);
	});

	test("Later hides it for good, across a reload", async ({ page }) => {
		await openStudio(page);
		await page.getByRole("button", { name: "Capture this code" }).click();
		const card = page.getByRole("group", { name: "First video" });
		await expect(card).toContainText("1 of 3");

		await card.getByRole("button", { name: /^Later/ }).click();
		await expect(card).toHaveCount(0);
		// The focus did not fall to the page.
		await expect(page.locator("body")).not.toBeFocused();

		await page.reload();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		await page.getByRole("button", { name: "Edit", exact: true }).click();
		await expect(page.getByText("Scene 1 of 1")).toBeVisible();
		await expect(page.getByRole("group", { name: "First video" })).toHaveCount(0);
	});
});
