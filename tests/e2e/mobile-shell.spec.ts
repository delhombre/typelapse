import { devices } from "@playwright/test";
import { quadrantPng } from "./support/fixtures";
import { expect, openStudio, test } from "./support/studio";

// A phone: 390 px wide, touch, a mobile user agent. Chromium only, like the rest.
const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
test.use({ ...phone, viewport: { width: 390, height: 844 } });

test.describe("Mobile shell: the studio works with a thumb at 390 px", () => {
	test("capture, drop a photo, go back to the code, undo the photo", async ({ page }) => {
		await openStudio(page);
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await expect(sheet).toBeVisible();
		await expect(page.getByRole("region", { name: "Studio resources" })).toBeVisible();

		// Raise the sheet to the scenes stop, then capture the live code.
		await page.locator("[data-vaul-handle]").tap();
		await sheet.getByRole("button", { name: "Capture", exact: true }).tap();
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();

		// A photo dropped anywhere lands in the selected scene.
		const dataTransfer = await page.evaluateHandle((base64) => {
			const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
			const transfer = new DataTransfer();
			transfer.items.add(new File([bytes], "quadrants.png", { type: "image/png" }));
			return transfer;
		}, quadrantPng().toString("base64"));
		const stage = page.locator(".sc-stage");
		await stage.dispatchEvent("dragenter", { dataTransfer });
		await stage.dispatchEvent("dragover", { dataTransfer });
		await stage.dispatchEvent("drop", { dataTransfer });
		await expect(page.getByRole("button", { name: "Edit image layer" })).toBeVisible();

		// The dropped photo is picked: its inspector takes the code's place in the
		// sheet, and the Code chip is the way back.
		await expect(sheet.getByRole("button", { name: "quadrants.png", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toBeVisible();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toHaveCount(0);
		await sheet.getByRole("button", { name: "Code", exact: true }).tap();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toBeAttached();
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toHaveCount(0);

		// Undo takes the photo back out.
		await page.getByRole("button", { name: "Undo" }).tap();
		await expect(page.getByRole("button", { name: "Edit image layer" })).toHaveCount(0);
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();
	});
});
