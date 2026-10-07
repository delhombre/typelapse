import type { Page } from "@playwright/test";
import { probeVideo } from "./support/media";
import { downloadFrom, expect, openStudio, test } from "./support/studio";

/**
 * Ticket #174: a 300-character line used to shrink the card to a 9 px strip on
 * 16:9. It is cut at the floor's columns now, with a short fade, in the preview
 * and in the on-device PNG alike. The screenshots and the PNG are kept as the
 * test's attachments: the right edge of both is the proof the PR carries.
 */

const LONG = `const message = "${"lorem ipsum dolor sit amet ".repeat(11).slice(0, 281)}";`;
const SOURCE = ["// One line far longer than any window.", LONG, "export default message;"].join(
	"\n",
);
const ORDINARY = ["export function greet(name: string) {", "  return `Hello, ${name}!`;", "}"].join(
	"\n",
);

function importHash(source: string): string {
	return `#import=${Buffer.from(JSON.stringify({ source }), "utf8").toString("base64url")}`;
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

/** The code column the token spans sit in, found by the long token's text. */
function codeColumn(page: Page, text: string) {
	return page.locator("[data-export-target] span", { hasText: text }).first().locator("xpath=..");
}

test.describe("A long line is cut at the floor's columns, with a fade", () => {
	test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

	test("the preview and the PNG cut the 300-character line the same way", async ({
		page,
	}, testInfo) => {
		expect(LONG.length).toBe(300);
		await openStudio(page, importHash(SOURCE));
		const column = codeColumn(page, "lorem ipsum");
		await expect(column).toBeVisible();
		// Chrome resolves the cells to px: the fade runs over three columns and ends
		// on the column's own right edge, the cut.
		const { mask, width, cell } = await column.evaluate((el) => ({
			mask: getComputedStyle(el).maskImage,
			width: Number.parseFloat(getComputedStyle(el).width),
			cell: Number.parseFloat(getComputedStyle(el).fontSize) * 0.6,
		}));
		const stops =
			/^linear-gradient\(to right, rgb\(0, 0, 0\) ([\d.]+)px, rgba\(0, 0, 0, 0\) ([\d.]+)px\)$/.exec(
				mask,
			);
		expect(stops, mask).not.toBeNull();
		const [from, to] = [Number(stops?.[1]), Number(stops?.[2])];
		expect(Math.abs(to - width)).toBeLessThan(1);
		expect((to - from) / cell).toBeGreaterThanOrEqual(3);
		expect((to - from) / cell).toBeLessThan(4);

		const frame = page.getByTestId("preview-frame");
		await frame.screenshot({ path: testInfo.outputPath("preview-long.png") });
		const { path } = await savePng(page, testInfo.outputPath("export-long.png"));
		expect(probeVideo(path)).toMatchObject({ width: 1920, height: 1080 });
	});

	test("an ordinary snippet is not cut", async ({ page }, testInfo) => {
		await openStudio(page, importHash(ORDINARY));
		const column = codeColumn(page, "greet");
		await expect(column).toBeVisible();
		expect(await column.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");
		await page.getByTestId("preview-frame").screenshot({
			path: testInfo.outputPath("preview-ordinary.png"),
		});
		await savePng(page, testInfo.outputPath("export-ordinary.png"));
	});
});
