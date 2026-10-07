import { type Page, devices } from "@playwright/test";
import { expect, openStudio, shareHash, test } from "./support/studio";

/**
 * Ticket #214: a visit pays for what it uses. Monaco is a megabyte of script
 * and its TypeScript worker another megabyte and a half; neither is requested
 * until the editor is on screen, and the TypeScript worker only for TS and JS.
 * These read the network of a production build, which is the only place the
 * chunk names and the lazy edges are the real ones.
 */
const MONACO =
	/\/assets\/(monaco-runtime|editor\.worker|ts\.worker|css\.worker|html\.worker|json\.worker|codicon)-/;
const TS_WORKER = /\/assets\/ts\.worker-/;

function watchMonaco(page: Page): { requested: () => string[] } {
	const urls: string[] = [];
	page.on("request", (request) => {
		const url = request.url();
		if (MONACO.test(url)) urls.push(new URL(url).pathname);
	});
	return { requested: () => [...urls] };
}

async function setPreferences(page: Page, codeFolded: boolean): Promise<void> {
	await page.addInitScript((folded) => {
		window.localStorage.setItem("typelapse:shell", JSON.stringify({ codeFolded: folded }));
	}, codeFolded);
}

test.describe("Studio boot weight: desktop", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("Preview never downloads Monaco; Edit does, and Preview then Edit keeps the text", async ({
		page,
	}) => {
		const monaco = watchMonaco(page);
		await openStudio(page);
		await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("preview-frame")).toContainText("greet");
		// The page is idle and settled: nothing has asked for the editor.
		await page.waitForLoadState("networkidle");
		expect(monaco.requested()).toEqual([]);

		await page.getByRole("button", { name: "Edit", exact: true }).click();
		const editor = page.locator("#studio-editor");
		await expect(editor.locator(".view-line").first()).toBeVisible();
		expect(monaco.requested().some((url) => /monaco-runtime-/.test(url))).toBe(true);

		await editor.locator(".view-line").first().click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type("\nconst kept = 1;");
		await expect(editor).toContainText("const kept = 1;");

		await page.getByRole("button", { name: "Preview", exact: true }).click();
		await page.getByRole("button", { name: "Edit", exact: true }).click();
		await expect(editor).toContainText("const kept = 1;");
		await expect(page.getByTestId("preview-frame")).toContainText("kept");
	});

	test("a studio that opens on Edit mounts the editor at once", async ({ page }) => {
		await setPreferences(page, false);
		const monaco = watchMonaco(page);
		await openStudio(page);
		await expect(page.locator("#studio-editor .view-line").first()).toBeVisible();
		expect(monaco.requested().some((url) => /monaco-runtime-/.test(url))).toBe(true);
	});

	/** A studio opened on a snippet in `language`, with the editor shown. */
	async function openOn(page: Page, language: string): Promise<void> {
		await setPreferences(page, false);
		await openStudio(
			page,
			shareHash({
				title: "snippet",
				code: language === "python" ? "print(1)" : "const a = 1;",
				language,
				themeName: "nord",
				background: "mesh:ocean",
				steps: [],
			}),
		);
		await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue(language);
		await expect(page.locator("#studio-editor .view-line").first()).toBeVisible();
		await page.waitForLoadState("networkidle");
	}

	test("a Python snippet opens the editor worker and never the TypeScript one", async ({
		page,
	}) => {
		const monaco = watchMonaco(page);
		await openOn(page, "python");
		expect(monaco.requested().some((url) => /\/editor\.worker-/.test(url))).toBe(true);
		expect(monaco.requested().filter((url) => TS_WORKER.test(url))).toEqual([]);
	});

	test("a TypeScript snippet opens the TypeScript worker", async ({ page }) => {
		const monaco = watchMonaco(page);
		await openOn(page, "typescript");
		expect(monaco.requested().filter((url) => TS_WORKER.test(url))).toHaveLength(1);
	});
});

test.describe("Studio boot weight: phone", () => {
	const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
	test.use({ ...phone, viewport: { width: 390, height: 844 } });

	test("the sheet at its peek holds no editor; raising it mounts Monaco", async ({ page }) => {
		const monaco = watchMonaco(page);
		await openStudio(page);
		await expect(page.getByRole("slider", { name: "Sheet height" })).toHaveAttribute(
			"aria-valuetext",
			"Collapsed",
		);
		await page.waitForLoadState("networkidle");
		expect(monaco.requested()).toEqual([]);

		await page.locator("[data-vaul-handle]").tap();
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toBeAttached();
		expect(monaco.requested().some((url) => /monaco-runtime-/.test(url))).toBe(true);
	});
});

test.describe("Studio boot: the files, the tab, the outline", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("/app asks for its own chunk from the document, before the bundle has run", async ({
		page,
	}) => {
		// The HTML as served, not as the app left it: the page's own scripts write
		// the hints, and they run ahead of the entry bundle.
		const served = await (await page.request.get("/app")).text();
		expect(served).toMatch(/id="typelapse-studio-chunks"/);
		await page.goto("/app");
		const hinted = await page.evaluate(() =>
			[...document.head.querySelectorAll('link[rel="modulepreload"]')].map((link) =>
				link.getAttribute("href"),
			),
		);
		expect(hinted.some((href) => /\/assets\/studio-route-/.test(href ?? ""))).toBe(true);
		expect(hinted.some((href) => /monaco-runtime/.test(href ?? ""))).toBe(false);
	});

	test("the landing does not fetch the studio until a way into it is reached", async ({ page }) => {
		const studio: string[] = [];
		page.on("request", (request) => {
			if (/\/assets\/studio-route-/.test(request.url())) studio.push(request.url());
		});
		await page.goto("/");
		await page.waitForLoadState("networkidle");
		expect(studio).toEqual([]);

		const requested = page.waitForRequest(/\/assets\/studio-route-.*\.js/);
		await page.getByRole("link", { name: "Open studio" }).first().hover();
		await requested;
	});

	test("the tab says Studio, then the project's name, then the 404's own title", async ({
		page,
	}) => {
		await openStudio(page);
		await expect(page).toHaveTitle("Studio · Typelapse");

		await page.getByRole("textbox", { name: "Project name" }).fill("Release notes");
		await page.keyboard.press("Enter");
		await expect(page).toHaveTitle("Release notes · Typelapse");

		await page.goto("/nowhere");
		await expect(page).toHaveTitle("Page not found · Typelapse");
	});

	test("the studio's outline fills the wait for its chunk, then gives way to the studio", async ({
		page,
	}) => {
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(/\/assets\/studio-route-.*\.js/, async (route) => {
			await held;
			await route.continue();
		});
		await page.goto("/app", { waitUntil: "commit" });
		const outline = page.getByRole("status", { name: "Loading the studio" });
		await expect(outline).toBeVisible();
		await expect(outline.locator(".sk-frame")).toBeVisible();
		// The page is not blank: the header's pills and the frame are drawn.
		expect(await outline.locator(".sk-pill").count()).toBeGreaterThan(3);

		release();
		await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
		await expect(outline).toHaveCount(0);
	});

	test("a studio with no entry bundle says so instead of staying blank", async ({ page }) => {
		await page.route(/\/assets\/index-.*\.js/, (route) => route.abort());
		await page.goto("/app");
		await expect(page.getByText("Typelapse did not load")).toBeVisible();
		await expect(page.getByRole("link", { name: "reload the page" })).toBeVisible();
	});
});

test.describe("Studio boot: JavaScript off", () => {
	test.use({ javaScriptEnabled: false });

	test("the page names itself and points at the studio", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("sharp code videos");
		await expect(page.getByRole("link", { name: "open the studio" })).toHaveAttribute(
			"href",
			"/app",
		);
	});
});
