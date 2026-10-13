import { type Page, devices } from "@playwright/test";
import { expect, oneSceneHash, openStudio, shareHash, test } from "./support/studio";

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
		await openStudio(page, oneSceneHash());
		await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("preview-frame")).toContainText("const");
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
	});

	test("an empty project opens in Edit, and mounts the editor at once (#270)", async ({ page }) => {
		const monaco = watchMonaco(page);
		await openStudio(page);
		await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.locator("#studio-editor .view-line").first()).toBeVisible();
		expect(monaco.requested().some((url) => /monaco-runtime-/.test(url))).toBe(true);
	});

	test("a project with a scene opens in the mode that was kept: Edit mounts the editor at once", async ({
		page,
	}) => {
		await setPreferences(page, false);
		const monaco = watchMonaco(page);
		await openStudio(page, oneSceneHash());
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

	test("an empty project's sheet opens on the scenes stop with no editor; the Edit stop mounts Monaco (#270)", async ({
		page,
	}) => {
		const monaco = watchMonaco(page);
		await openStudio(page);
		const handle = page.getByRole("slider", { name: "Sheet height" });
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await page.waitForLoadState("networkidle");
		expect(monaco.requested()).toEqual([]);

		await handle.focus();
		await page.keyboard.press("End");
		await expect(handle).toHaveAttribute("aria-valuetext", "Open");
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toBeAttached();
		expect(monaco.requested().some((url) => /monaco-runtime-/.test(url))).toBe(true);
	});

	test("the sheet at its peek holds no editor; raising it mounts Monaco", async ({ page }) => {
		const monaco = watchMonaco(page);
		await openStudio(page, oneSceneHash());
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

	test("the brand link gives the landing its own title back after a hard load of /app", async ({
		page,
	}) => {
		await page.goto("/");
		const landing = await page.title();
		expect(landing).toMatch(/sharp/i);

		// Hard load: index.html named the tab before React ran.
		await openStudio(page);
		await expect(page).toHaveTitle("Studio · Typelapse");
		await page.getByRole("link", { name: "Typelapse home" }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page).toHaveTitle(landing);
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

	/** The box of the first element matching `selector`, in window px. */
	async function boxOf(page: Page, selector: string): Promise<number[]> {
		return page.evaluate((query) => {
			const rect = document.querySelector(query)?.getBoundingClientRect();
			if (!rect) {
				throw new Error(`no ${query}`);
			}
			return [rect.left, rect.top, rect.width, rect.height];
		}, selector);
	}

	// #226: the outline's frame is the studio's own at every window, so the
	// picture does not resize or jump when the studio arrives.
	for (const [width, height] of [
		[1280, 800],
		[1440, 900],
		[1366, 650],
		[820, 1180],
		[390, 844],
	] as const) {
		test(`the outline's frame is the studio's frame at ${width}x${height}`, async ({ page }) => {
			await page.setViewportSize({ width, height });
			let release: () => void = () => undefined;
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			await page.route(/\/assets\/studio-route-.*\.js/, async (route) => {
				await held;
				await route.continue();
			});
			// The outline draws the Preview's frame. A project with a scene opens there on a
			// desktop; an empty one opens in Edit (#270), where the stage sits to the right.
			await page.goto(`/app${width >= 1280 ? oneSceneHash() : ""}`, { waitUntil: "commit" });
			await expect(page.locator(".sk-frame")).toBeVisible();
			const outline = await boxOf(page, ".sk-frame");

			release();
			await expect(page.getByRole("button", { name: "Add source" })).toBeEnabled();
			// The studio's own arrival is a spring; its frame is where it settles.
			await expect(async () => {
				const before = await boxOf(page, "[data-testid=preview-frame]");
				await page.waitForTimeout(150);
				expect(await boxOf(page, "[data-testid=preview-frame]")).toEqual(before);
			}).toPass();
			const studio = await boxOf(page, "[data-testid=preview-frame]");

			outline.forEach((value, index) => {
				expect(Math.abs(value - (studio[index] ?? Number.NaN))).toBeLessThanOrEqual(1);
			});
		});
	}

	test("a studio with no entry bundle says so instead of staying blank", async ({ page }) => {
		await page.route(/\/assets\/index-.*\.js/, (route) => route.abort());
		await page.goto("/app");
		await expect(page.getByText("Still loading.")).toBeVisible();
		const reload = page.getByRole("link", { name: "Reload" });
		await expect(reload).toBeVisible();
		expect(await reload.evaluate((link) => getComputedStyle(link).textDecorationLine)).toBe(
			"underline",
		);
	});

	test("the failed boot's link is readable on the dark studio's paper", async ({ page }) => {
		await page.addInitScript(() =>
			window.localStorage.setItem("typelapse.studio-appearance", "dark"),
		);
		await page.route(/\/assets\/index-.*\.js/, (route) => route.abort());
		await page.goto("/app");
		const reload = page.getByRole("link", { name: "Reload" });
		await expect(reload).toBeVisible();
		expect(await reload.evaluate((link) => getComputedStyle(link).color)).toBe(
			"rgb(114, 155, 255)",
		);
	});
});

test.describe("Studio boot: JavaScript off", () => {
	test.use({ javaScriptEnabled: false });

	for (const route of ["/", "/app"]) {
		test(`${route} names itself and offers a reload that looks like a link`, async ({ page }) => {
			await page.goto(route);
			await expect(page.getByRole("heading", { level: 1 })).toContainText("sharp code videos");
			const reload = page.getByRole("link", { name: "reload this page" });
			// Never the page it is on by route: it is a reload.
			await expect(reload).toHaveAttribute("href", "");
			const look = await reload.evaluate((link) => {
				const style = getComputedStyle(link);
				return {
					line: style.textDecorationLine,
					color: style.color,
					ink: style.getPropertyValue("--boot-link"),
				};
			});
			expect(look.line).toBe("underline");
			expect(look.ink.trim()).toBe("#3b5bd4");
			expect(look.color).toBe("rgb(59, 91, 212)");
		});
	}
});
