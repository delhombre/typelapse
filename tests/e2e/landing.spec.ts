import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/studio";

/**
 * Bring a call to action to where a visitor's pointer can reach it. Links in
 * the page flow scroll into view. The floating nav cannot be scrolled to: it
 * hides over the hero, so scrolling "to" it toggles it. A visitor gets it back
 * by scrolling past the hero.
 */
async function reach(page: Page, link: Locator): Promise<void> {
	if (await link.evaluate(isFloating)) {
		await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
		await page.mouse.wheel(0, -120);
	} else {
		await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
	}
	await expect(link).toBeInViewport({ ratio: 1 });
}

function isFloating(element: Element): boolean {
	for (let node: Element | null = element; node; node = node.parentElement) {
		if (getComputedStyle(node).position === "fixed") return true;
	}
	return false;
}

const HERO = /^Typelapse\. Code videos as sharp as their preview/;

test.describe(
	"Landing: a visitor reads it on any screen and reaches the studio",
	{
		tag: "@smoke",
	},
	() => {
		test("first paint has the hero and no console errors", async ({ page, consoleErrors }) => {
			await page.goto("/");
			await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible();
			await page.waitForLoadState("networkidle");
			expect(consoleErrors).toEqual([]);
		});

		test("every call to action opens the studio", async ({ page }) => {
			// One studio load per call to action: the slowest journey of the landing.
			test.slow();
			// The nav slides and the hero demo loops; held still, each link is where a
			// visitor sees it. Motion has its own test.
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto("/");
			const ctas = page.locator('a[href="/app"], a[href^="/app#"], a[href^="/app?"]');
			const count = await ctas.count();
			expect(count).toBeGreaterThan(0);
			for (let index = 0; index < count; index++) {
				await page.goto("/");
				await reach(page, ctas.nth(index));
				// Playwright clicks once the link has held still for two frames.
				await ctas.nth(index).click();
				await expect(page).toHaveURL(/\/app(?:[#?].*)?$/);
				await expect(
					page.getByRole("heading", { level: 1, name: "Typelapse studio" }),
				).toBeAttached();
			}
			// The hero's own button, which is not a link: it starts from the paste box.
			await page.goto("/");
			await page.getByRole("button", { name: "Open studio" }).first().click();
			await expect(page).toHaveURL(/\/app(?:[#?].*)?$/);
		});

		test("a 375 px phone never scrolls sideways", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto("/");
			await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible();
			// Walk the whole page so lazily revealed sections are laid out too.
			const height = await page.evaluate(() => document.documentElement.scrollHeight);
			for (let y = 0; y <= height; y += 600) {
				await page.evaluate((top) => window.scrollTo(0, top), y);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
				);
				expect(overflow, `horizontal overflow at y=${y}`).toBeLessThanOrEqual(0);
			}
		});

		test("a dark system preference paints the dark page", async ({ browser }) => {
			const context = await browser.newContext({ colorScheme: "dark" });
			const page = await context.newPage();
			await page.goto("/");
			await expect(page.locator("html")).toHaveAttribute("data-landing-theme", "dark");
			await expect(page.locator("html")).toHaveCSS("background-color", "rgb(18, 17, 16)");
			await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
			await context.close();
		});

		test("reduced motion keeps the hero still until asked", async ({ browser }) => {
			const moving = await browser.newContext();
			const still = await browser.newContext({ reducedMotion: "reduce" });
			const [movingPage, stillPage] = await Promise.all([moving.newPage(), still.newPage()]);
			await Promise.all([movingPage.goto("/"), stillPage.goto("/")]);
			// The hero instrument plays on arrival and offers Pause; with reduced
			// motion it arrives paused and offers Play.
			await expect(movingPage.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
			await expect(stillPage.getByRole("button", { name: "Play", exact: true })).toBeVisible();
			await expect(stillPage.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
			await Promise.all([moving.close(), still.close()]);
		});
	},
);

test.describe("Landing: the page comes to rest once it has loaded", () => {
	test("nothing keeps resizing the page after load", async ({ page }) => {
		// Held still, so only a layout that cannot settle can move. Found by the
		// smoke job under act (#125): on Linux Chromium the magic-move section's
		// font fit (magic-move-section.tsx) never converged, the section's height
		// stepped between three values every frame and the page below it shook.
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await expect
			.poll(() =>
				page.evaluate(async () => {
					const heights = new Set<number>();
					for (let frame = 0; frame < 30; frame++) {
						await new Promise((resolve) => requestAnimationFrame(resolve));
						heights.add(document.documentElement.scrollHeight);
					}
					return [...heights];
				}),
			)
			.toHaveLength(1);
	});
});
