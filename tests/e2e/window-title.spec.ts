import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { GREET_DIFF } from "./support/fixtures";
import { probeVideo } from "./support/media";
import { addSource, downloadFrom, expect, openStudio, test } from "./support/studio";

/**
 * Ticket #186: a long project title is one line in the preview and in the
 * files. The preview wrapped it onto two lines under a taller bar while the PNG
 * and the MP4 painted one clipped line; one function now decides the string all
 * three draw (`windowTitle`).
 *
 * `PROOF_DIR` keeps the pictures a reviewer compares: the preview, the PNG and
 * the first frame of the MP4.
 */
const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";
const PR_URL = "https://github.com/honojs/hono/pull/5189";

async function importTitledPullRequest(page: Page): Promise<void> {
	await page.route("https://api.github.com/**", async (route) => {
		if (route.request().headers().accept === "application/vnd.github.diff") {
			return route.fulfill({ status: 200, contentType: "text/plain", body: GREET_DIFF });
		}
		return route.fulfill({ status: 200, json: { title: PR_TITLE } });
	});
	await openStudio(page);
	await addSource(page, "Import a change");
	await page.getByRole("textbox", { name: "Git diff or GitHub pull request link" }).fill(PR_URL);
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(PR_TITLE);
}

function keep(from: string, name: string): void {
	const dir = process.env.PROOF_DIR;
	if (!dir) {
		return;
	}
	mkdirSync(dir, { recursive: true });
	copyFileSync(from, join(dir, name));
}

test.describe("Window title: one line, cut by one function", { tag: "@smoke" }, () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("a pull request title is one ellipsised line in the preview, the PNG and the MP4", async ({
		page,
	}, testInfo) => {
		await importTitledPullRequest(page);
		await page.evaluate(() => document.fonts.ready);

		const title = page.getByTestId("preview-frame").locator(`[title="${PR_TITLE}"]`);
		await expect(title).toBeVisible();
		const drawn = (await title.textContent()) ?? "";
		expect(drawn).not.toBe(PR_TITLE);
		expect(drawn.endsWith("…")).toBe(true);
		expect(PR_TITLE.startsWith(drawn.slice(0, -1))).toBe(true);
		// One line: the box is no taller than a line of its own type.
		const { height, fontSize } = await title.evaluate((element) => ({
			height: element.getBoundingClientRect().height,
			fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
		}));
		expect(height).toBeLessThan(fontSize * 1.6);

		const preview = testInfo.outputPath("preview.png");
		await page.getByTestId("preview-frame").screenshot({ path: preview });
		keep(preview, "preview.png");

		await page.getByRole("button", { name: /^Export · / }).click();
		await expect(page.getByRole("group", { name: "Format" })).toBeVisible();

		const png = await downloadFrom(
			page,
			() => page.getByRole("button", { name: "PNG", exact: true }).click(),
			testInfo.outputPath("still.png"),
		);
		expect(probeVideo(png.path)).toMatchObject({ width: 1920, height: 1080 });
		keep(png.path, "still.png");

		const mp4 = await downloadFrom(
			page,
			() => page.getByRole("button", { name: /^Render · / }).click(),
			testInfo.outputPath("export.mp4"),
		);
		expect(probeVideo(mp4.path)).toMatchObject({ codec: "h264", width: 1920, height: 1080 });
		keep(mp4.path, "export.mp4");
	});
});
