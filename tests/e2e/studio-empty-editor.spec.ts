import { expect, oneSceneHash, openStudio, test } from "./support/studio";

/**
 * An emptied editor is a draft (#168): the studio keeps working, the preview
 * shows an empty card instead of the code that was deleted, and nothing is
 * captured from it. Typing again picks up where it left off.
 */
test.describe("Studio editor emptied with Select all and Delete", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("throws nothing, empties the card, disables Capture, and resumes on typing", async ({
		page,
		consoleErrors,
	}) => {
		await openStudio(page);
		const edit = page.getByRole("button", { name: "Edit", exact: true });
		if ((await edit.getAttribute("aria-pressed")) !== "true") await edit.click();

		const preview = page.getByTestId("preview-frame");
		await expect(preview).toContainText("greet");

		// A click on the first line is a click into the text, so the editor has the
		// keyboard before the chord is pressed.
		await page.locator("#studio-editor .view-line").first().click();
		await expect(page.locator("#studio-editor .native-edit-context")).toBeFocused();
		// Control, not ControlOrMeta: the "Desktop Chrome" device presents a Windows
		// user agent, so Monaco binds Select all to Control on every host.
		const errorsBefore = consoleErrors.length;
		await page.keyboard.press("Control+a");
		await page.keyboard.press("Delete");

		await expect(preview).not.toContainText("greet");
		// The empty card is empty: the composition must not invent a title card there.
		await expect(preview).not.toContainText("Add your text");
		await expect(page.getByRole("button", { name: "Play timeline" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Add scene" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Capture", exact: true })).toBeDisabled();
		expect(consoleErrors.slice(errorsBefore)).toEqual([]);

		await page.keyboard.type("const answer = 42;");
		await expect(preview).toContainText("answer");
		await expect(preview).not.toContainText("Add your text");
		await expect(page.getByRole("button", { name: "Play timeline" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Add scene" })).toBeEnabled();
		// With code and no scene, the fork's Capture is the one Capture control.
		await expect(
			page.getByRole("button", { name: "Capture this code", exact: true }),
		).toBeEnabled();
		expect(consoleErrors.slice(errorsBefore)).toEqual([]);
	});
});

/**
 * An empty project opens on its path (#270): in Edit, so the fork of the empty
 * scene is on screen at load. A project with a scene opens as it always did.
 */
test.describe("Studio opened on an empty project", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("shows the fork in Edit on load, with no click", async ({ page }) => {
		await openStudio(page);
		await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		for (const name of [
			/^Capture this code$/,
			/^Start from an example/,
			/^Import a pull request/,
		]) {
			const action = page.getByRole("button", { name });
			await expect(action).toBeVisible();
			const box = await action.boundingBox();
			expect(box && box.y >= 0 && box.y + box.height <= 900, String(name)).toBe(true);
		}
	});

	test("opens in Preview, with no fork, once the project has a scene", async ({ page }) => {
		await openStudio(page, oneSceneHash());
		await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByRole("button", { name: /^Capture this code$/ })).toBeHidden();
	});
});
