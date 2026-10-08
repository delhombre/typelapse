import type { Page } from "@playwright/test";
import { GREET_DIFF } from "./support/fixtures";
import { addSource, expect, openStudio, settled, test } from "./support/studio";

/**
 * The header holds its places however long the project's name is: a pull
 * request title is 50 characters of somebody else's prose, and it must never
 * push the Preview/Edit switch under the Library button (#167).
 */
const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";
const PR_URL = "https://github.com/honojs/hono/pull/5189";

async function importTitledPullRequest(page: Page): Promise<void> {
	await page.route("https://api.github.com/**", async (route) => {
		const request = route.request();
		if (request.headers().accept === "application/vnd.github.diff") {
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

/** Every control in the header that takes a box, by what a person would call it. */
async function headerControls(page: Page) {
	return page.locator(".studio-camera-header").evaluate((header) =>
		[...header.querySelectorAll<HTMLElement>("button, a[href], input")]
			.map((element) => {
				const box = element.getBoundingClientRect();
				const name =
					element.getAttribute("aria-label") ??
					(element as HTMLInputElement).placeholder ??
					element.textContent?.trim() ??
					element.tagName;
				return { name, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
			})
			.filter((box) => box.right - box.left > 0 && box.bottom - box.top > 0),
	);
}

for (const width of [1280, 1440]) {
	test.describe(`Studio header at ${width}px with a 50-character title`, () => {
		test.use({ viewport: { width, height: 900 } });

		test("no two controls overlap and Preview still switches the mode", async ({ page }) => {
			await importTitledPullRequest(page);
			await settled(page.locator(".studio-camera-header .sc-project"));

			const controls = await headerControls(page);
			const overlaps: string[] = [];
			for (const [index, a] of controls.entries()) {
				for (const b of controls.slice(index + 1)) {
					const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
					const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
					if (across > 0.5 && down > 0.5) overlaps.push(`${a.name} / ${b.name}`);
				}
			}
			expect(overlaps).toEqual([]);

			// The name ends in an ellipsis and keeps its whole text for a hover.
			await expect(page.getByRole("textbox", { name: "Project name" })).toHaveAttribute(
				"title",
				PR_TITLE,
			);

			const preview = page.getByRole("button", { name: "Preview", exact: true });
			const edit = page.getByRole("button", { name: "Edit", exact: true });
			await edit.click();
			await expect(edit).toHaveAttribute("aria-pressed", "true");
			await preview.click();
			await expect(preview).toHaveAttribute("aria-pressed", "true");
		});
	});
}
