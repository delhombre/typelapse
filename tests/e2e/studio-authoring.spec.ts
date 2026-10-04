import { quadrantPng } from "./support/fixtures";
import {
	addSource,
	expect,
	openStudio,
	sceneCount,
	stageLayers,
	storedScenes,
	test,
} from "./support/studio";

const TITLE = "Ship the diff";

test.describe(
	"Studio authoring: scenes and layers are made, undone and kept",
	{
		tag: "@smoke",
	},
	() => {
		test("capture, blank scene, text and image layers, reorder, undo and redo, then a reload keeps it all", async ({
			page,
		}) => {
			await openStudio(page);
			await expect(sceneCount(page, 0)).toBeVisible();

			// Capture: the live code becomes scene 1. Blank: a scene with no card.
			await page.getByRole("button", { name: "Add scene" }).click();
			await expect(sceneCount(page, 1)).toBeVisible();
			await page.getByRole("button", { name: "Blank", exact: true }).first().click();
			await expect(sceneCount(page, 2)).toBeVisible();
			await page.getByRole("button", { name: /^Scene 1, / }).click();

			// A text layer on scene 1, edited in its inspector.
			await addSource(page, "Add text");
			await page.getByRole("button", { name: "Edit", exact: true }).click();
			const content = page.getByRole("textbox", { name: "Text layer content" });
			await content.fill(TITLE);
			await expect(page.getByRole("button", { name: "Edit text layer" })).toHaveText(TITLE);

			// An image layer from a file: it lands at the back, under the text.
			await page.getByRole("button", { name: "Add source" }).click();
			const chooser = page.waitForEvent("filechooser");
			await page.getByRole("menuitem", { name: "Add photo or video" }).click();
			await (await chooser).setFiles({
				name: "quadrants.png",
				mimeType: "image/png",
				buffer: quadrantPng(),
			});
			await expect(page.getByRole("button", { name: "Edit image layer" })).toBeVisible();
			await expect(
				page.getByRole("button", { name: /^Scene 1, .*with text, image/ }),
			).toBeVisible();
			expect(await stageLayers(page)).toEqual(["Edit image layer", "Edit text layer"]);

			// Reorder: the image comes to the front.
			await page.getByRole("button", { name: "Bring to front" }).click();
			await expect.poll(() => stageLayers(page)).toEqual(["Edit text layer", "Edit image layer"]);

			// Undo puts it back, redo brings it forward again.
			await page.getByRole("button", { name: "Undo" }).click();
			await expect.poll(() => stageLayers(page)).toEqual(["Edit image layer", "Edit text layer"]);
			await page.getByRole("button", { name: "Redo" }).click();
			await expect.poll(() => stageLayers(page)).toEqual(["Edit text layer", "Edit image layer"]);

			// The composition saves on a debounce: wait for the write, not a timer.
			await expect
				.poll(async () => {
					const scenes = await storedScenes(page);
					return scenes.some((scene) => {
						const kinds = scene.blocks.map((block) => block.kind);
						const text = scene.blocks.find((block) => block.kind === "text");
						return text?.text === TITLE && kinds.indexOf("text") < kinds.indexOf("image");
					});
				})
				.toBe(true);

			await page.reload();
			await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
			await expect(sceneCount(page, 2)).toBeVisible();
			await expect(page.getByRole("button", { name: "Edit text layer" })).toHaveText(TITLE);
			await expect.poll(() => stageLayers(page)).toEqual(["Edit text layer", "Edit image layer"]);
			// The image's bytes came back from IndexedDB, not just its name.
			await expect
				.poll(() =>
					page
						.getByRole("button", { name: "Edit image layer" })
						.locator("img")
						.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth),
				)
				.toBe(320);
		});
	},
);
