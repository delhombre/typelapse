import type { Page } from "@playwright/test";
import { FONT_PRESETS } from "../../src/application/fonts/code-fonts";
import { downloadFrom, expect, openStudio, sceneCount, test } from "./support/studio";

/**
 * Nothing uploaded means nothing asked of a third party either: a picked font
 * is a file this app serves, in the preview and in the on-device export alike.
 * Google's font hosts are blocked here, so a regression fails twice, once on
 * the request and once on the font that never arrives.
 */
const FONT_HOSTS = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;

/** The Latin file each picker font draws its glyphs from. */
const LATIN_FILE: Record<string, string> = {
	"JetBrains Mono": "JetBrainsMono-latin.woff2",
	"Fira Code": "FiraCode-latin.woff2",
	"Source Code Pro": "SourceCodePro-latin.woff2",
	"IBM Plex Mono": "IBMPlexMono-latin.woff2",
	"Cascadia Code": "CascadiaCode-latin.woff2",
};

async function pickFont(page: Page, label: string) {
	await page.getByRole("button", { name: "Look settings" }).click();
	await page.getByRole("button", { name: "Font choices" }).click();
	await page.getByRole("button", { name: label, exact: true }).click();
	await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
}

async function loadedFaces(page: Page, family: string) {
	return page.evaluate(
		(name) =>
			[...document.fonts]
				.filter((face) => face.family.replace(/["']/g, "") === name)
				.map((f) => f.status),
		family,
	);
}

test.describe("Fonts are served by the app, never by Google", () => {
	let fontRequests: string[];
	let served: string[];

	test.beforeEach(async ({ page, context }) => {
		fontRequests = [];
		served = [];
		await context.route(FONT_HOSTS, (route) => {
			fontRequests.push(route.request().url());
			return route.abort();
		});
		// The context sees the worker's requests too, which the page does not.
		context.on("requestfinished", (request) => {
			if (request.url().includes("/fonts/")) {
				served.push(new URL(request.url()).pathname);
			}
		});
		await openStudio(page);
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
	});

	for (const font of FONT_PRESETS) {
		// One font guards CI against a return to Google; the full run covers the rest.
		const tag = font.family === "Fira Code" ? ["@smoke"] : [];
		test(
			`${font.family}: the preview draws it from /fonts and the on-device export renders it`,
			{ tag },
			async ({ page }, testInfo) => {
				await pickFont(page, font.label);
				await page.evaluate(
					(stack) => document.fonts.load(`16px ${stack.split(",")[0]}`, "0"),
					font.stack,
				);
				await page.evaluate(() => document.fonts.ready);
				expect(await loadedFaces(page, font.family)).toContain("loaded");
				expect(served).toContain(`/fonts/${LATIN_FILE[font.family]}`);

				// Back out of the font choices and the Look row to the export controls.
				await page.getByRole("button", { name: "Back to look controls" }).click();
				await page.getByRole("button", { name: "Back to studio controls" }).click();
				await page.getByRole("button", { name: /^Export · / }).click();
				await page.getByRole("button", { name: "GIF", exact: true }).click();
				const { download } = await downloadFrom(
					page,
					() => page.getByRole("button", { name: /^Render · / }).click(),
					testInfo.outputPath("export.gif"),
				);
				// The worker refuses an export whose font it could not load, so a file
				// is a font that arrived; and it arrived from here.
				expect(download.suggestedFilename()).toMatch(/\.gif$/);
				expect(fontRequests).toEqual([]);
			},
		);
	}
});
