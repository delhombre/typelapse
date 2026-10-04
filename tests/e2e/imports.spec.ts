import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { GREET_DIFF } from "./support/fixtures";
import {
	addSource,
	downloadFrom,
	expect,
	importHash,
	localLibrary,
	openStudio,
	sceneCount,
	test,
} from "./support/studio";

const MOCK_PR = "https://github.com/acme/widgets/pull/42";
const MOCK_PR_TITLE = "Trim names before greeting";

/** A merged, two-file pull request on a public repository that will not move. */
const REAL_PR = "https://github.com/sindresorhus/is/pull/200";
const REAL_PR_TITLE = "feat: ensure there's at least 1 char in non-empty string";

async function pasteChange(page: Page, source: string): Promise<void> {
	await addSource(page, "Import a git diff");
	await page.getByRole("textbox", { name: "Git diff or GitHub pull request link" }).fill(source);
	await page.getByRole("button", { name: "Apply" }).click();
}

const projectName = (page: Page) => page.getByRole("textbox", { name: "Project name" });

test.describe("Imports: a change, a pull request or a project file becomes the project", () => {
	test(
		"a pasted diff becomes one scene per state of the file",
		{
			tag: "@smoke",
		},
		async ({ page }) => {
			await openStudio(page);
			await pasteChange(page, GREET_DIFF);
			await expect(projectName(page)).toHaveValue("greet.ts");
			await expect(sceneCount(page, 2)).toBeVisible();
			await page.getByRole("button", { name: /^Scene 2, / }).click();
			await expect(page.getByTestId("preview-frame")).toContainText(
				/const\s*trimmed\s*=\s*name\.trim\(\);/,
			);
		},
	);

	test("a pull request URL is read from the GitHub API", { tag: "@smoke" }, async ({ page }) => {
		const asked: string[] = [];
		await page.route("https://api.github.com/**", async (route) => {
			const request = route.request();
			asked.push(`${request.headers().accept} ${new URL(request.url()).pathname}`);
			if (new URL(request.url()).pathname !== "/repos/acme/widgets/pulls/42") {
				return route.fulfill({ status: 404, body: "{}" });
			}
			if (request.headers().accept === "application/vnd.github.diff") {
				return route.fulfill({ status: 200, contentType: "text/plain", body: GREET_DIFF });
			}
			return route.fulfill({ status: 200, json: { title: MOCK_PR_TITLE } });
		});
		await openStudio(page);
		await pasteChange(page, MOCK_PR);
		await expect(projectName(page)).toHaveValue(MOCK_PR_TITLE);
		await expect(sceneCount(page, 2)).toBeVisible();
		expect(asked.sort()).toEqual([
			"application/vnd.github+json /repos/acme/widgets/pulls/42",
			"application/vnd.github.diff /repos/acme/widgets/pulls/42",
		]);
	});

	test("a real public pull request imports", { tag: "@network" }, async ({ page }) => {
		// GitHub allows 60 anonymous API calls an hour per address, shared by every
		// job on a runner. The nightly passes its token, added here on the way out:
		// the request still reaches the real pull request.
		const token = process.env.GITHUB_TOKEN;
		if (token) {
			await page.route("https://api.github.com/**", (route) =>
				route.continue({
					headers: { ...route.request().headers(), authorization: `Bearer ${token}` },
				}),
			);
		}
		await openStudio(page);
		await pasteChange(page, REAL_PR);
		const rateLimited = page.getByText(/GitHub rate limit hit/);
		await expect
			.poll(
				async () =>
					(await rateLimited.count()) > 0 ? "rate limited" : projectName(page).inputValue(),
				{
					timeout: 20_000,
				},
			)
			.toMatch(/^(rate limited|feat: .*)$/);
		// Without a token a spent quota says nothing about the product; with one, it fails.
		test.skip(!token && (await rateLimited.count()) > 0, "GitHub's anonymous rate limit is spent");
		await expect(projectName(page)).toHaveValue(REAL_PR_TITLE);
		await expect(page.getByRole("button", { name: /^Scene 1, / })).toBeVisible();
	});

	test(
		"a project file exported then opened exports byte for byte the same",
		{
			tag: "@smoke",
		},
		async ({ page, browser }, testInfo) => {
			await openStudio(page);
			await pasteChange(page, GREET_DIFF);
			await expect(sceneCount(page, 2)).toBeVisible();
			await addSource(page, "Add text");
			await expect(page.getByRole("button", { name: /^Scene \d, .*with text/ })).toBeVisible();

			const exportFile = (from: Page, name: string) =>
				downloadFrom(
					from,
					() => from.getByRole("button", { name: "Export project file" }).click(),
					testInfo.outputPath(name),
				);
			const first = await exportFile(page, "first.json");
			expect(first.download.suggestedFilename()).toMatch(/\.json$/);

			const openFile = async (into: Page, path: string) => {
				await into.getByRole("button", { name: "Add source" }).click();
				const chooser = into.waitForEvent("filechooser");
				await into.getByRole("menuitem", { name: "Open project file" }).click();
				await (await chooser).setFiles(path);
			};

			// Same studio: change the project, open the file over it, export again.
			await page.getByRole("button", { name: "Blank", exact: true }).first().click();
			await expect(sceneCount(page, 3)).toBeVisible();
			await openFile(page, first.path);
			await page.getByRole("button", { name: "Open the file" }).click();
			await expect(sceneCount(page, 2)).toBeVisible();
			const second = await exportFile(page, "second.json");
			expect(readFileSync(second.path).equals(readFileSync(first.path))).toBe(true);

			// A fresh browser profile: nothing of the first session can leak in. The
			// file lands in that browser's own local project, which keeps its id
			// (studio-project-replacement), so the id is the one byte allowed to move.
			const fresh = await browser.newContext();
			const reader = await fresh.newPage();
			await openStudio(reader);
			await expect(sceneCount(reader, 0)).toBeVisible();
			await openFile(reader, first.path);
			await expect(projectName(reader)).toHaveValue("greet.ts");
			await expect(reader.getByRole("button", { name: /^Scene \d, .*with text/ })).toBeVisible();
			const third = await exportFile(reader, "third.json");
			await fresh.close();
			const original = JSON.parse(readFileSync(first.path, "utf8"));
			const reopened = JSON.parse(readFileSync(third.path, "utf8"));
			expect(reopened.project.id).not.toBe(original.project.id);
			reopened.project.id = original.project.id;
			expect(reopened).toEqual(original);
		},
	);

	test("arriving on an import link opens a new project and keeps the open one", async ({
		page,
		context,
	}) => {
		await openStudio(page);
		await projectName(page).fill("Keep me");
		await page.getByRole("button", { name: "Add scene" }).click();
		await expect(sceneCount(page, 1)).toBeVisible();
		await expect
			.poll(async () => (await localLibrary(page)).projects.map((entry) => entry.project.title))
			.toEqual(["Keep me"]);
		await page.close();

		const arrival = await context.newPage();
		await openStudio(arrival, importHash(GREET_DIFF));
		await expect(projectName(arrival)).toHaveValue("greet.ts");
		await expect(sceneCount(arrival, 2)).toBeVisible();
		await expect
			.poll(async () => {
				const library = await localLibrary(arrival);
				const active = library.projects.find((entry) => entry.id === library.activeId);
				return {
					titles: library.projects.map((entry) => entry.project.title).sort(),
					active: active?.project.title,
				};
			})
			.toEqual({ titles: ["Keep me", "greet.ts"], active: "greet.ts" });
	});
});
