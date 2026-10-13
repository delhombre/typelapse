import { expect, sceneCount, test } from "./support/studio";

declare global {
	interface Window {
		__from?: number;
	}
}

function codeOfLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `const value${i} = compute(${i});`).join("\n");
}

test.describe("Landing: the hero's paste field", () => {
	test("a pasted snippet arrives in the studio as scene one, ready to play", async ({ page }) => {
		await page.goto("/");
		// Well under the studio's 5,000-line ceiling.
		const code = "const answer = 42;\nconsole.log(answer);";
		await page.getByRole("textbox", { name: /paste a/i }).fill(code);
		await page.getByRole("button", { name: "Import & animate" }).click();
		await expect(page).toHaveURL(/\/app(?:[#?].*)?$/);
		// It used to land on "0 scenes" with Play disabled: the button's promise, broken.
		await expect(sceneCount(page, 1)).toBeVisible();
		const play = page.getByRole("button", { name: "Play timeline" });
		await expect(play).toBeEnabled();
		// And it plays.
		await play.click();
		await expect(page.getByRole("button", { name: "Pause timeline" })).toBeVisible();
	});

	// A local measurement, not a gate: wall-clock budgets are not honest on a shared
	// runner (one run read 227 ms under a load average of 25). Run it with
	// `E2E_PERF=1 pnpm exec playwright test -g @perf`. Measured on a quiet laptop,
	// production build: 102, 106, 117, 119 and 126 ms for 8,000 lines.
	test("8,000 lines pasted into the field land inside the 200 ms budget @perf", async ({
		browser,
	}) => {
		// A real paste (Cmd+V). Playwright's `fill` is Chromium's `insertText`, which is
		// quadratic in lines whatever the page does (61 s at this size on a bare
		// textarea), so it says nothing about the product and is not used here.
		const context = await browser.newContext({
			permissions: ["clipboard-read", "clipboard-write"],
		});
		const page = await context.newPage();
		await page.goto("/");
		const field = page.getByRole("textbox", { name: /paste a/i });
		const code = codeOfLines(8000);

		await page.evaluate((text) => navigator.clipboard.writeText(text), code);
		await field.focus();
		// From the paste event to the second frame after it: what the visitor waits through.
		// Best of three, because a shared CI runner can stall any single frame.
		const timings: number[] = [];
		for (let attempt = 0; attempt < 3; attempt++) {
			await field.focus();
			await page.keyboard.press("ControlOrMeta+A");
			await page.keyboard.press("Backspace");
			await page.evaluate(() => {
				document.querySelector(".lp-field textarea")?.addEventListener(
					"paste",
					() => {
						window.__from = performance.now();
					},
					{ once: true, capture: true },
				);
			});
			await page.keyboard.press("ControlOrMeta+V");
			timings.push(
				await page.evaluate(
					() =>
						new Promise<number>((resolve) => {
							requestAnimationFrame(() =>
								requestAnimationFrame(() => resolve(performance.now() - (window.__from ?? 0))),
							);
						}),
				),
			);
		}

		await expect(field).toHaveValue(code);
		const best = Math.min(...timings);
		console.log(`8000 lines pasted: ${timings.map(Math.round).join(", ")} ms`);
		expect(best).toBeLessThan(200);
		await context.close();
	});

	test("a paste over the studio's ceiling lands on the reason, not on a blank studio", async ({
		browser,
	}) => {
		// The hero carries any paste; the studio keeps its 5,000-line ceiling and says so.
		const context = await browser.newContext({
			permissions: ["clipboard-read", "clipboard-write"],
		});
		const page = await context.newPage();
		await page.goto("/");
		const field = page.getByRole("textbox", { name: /paste a/i });
		await page.evaluate((text) => navigator.clipboard.writeText(text), codeOfLines(6000));
		await field.focus();
		await page.keyboard.press("ControlOrMeta+V");
		await page.getByRole("button", { name: "Import & animate" }).click();
		await expect(page).toHaveURL(/\/app(?:[#?].*)?$/);
		await expect(page.getByText(/too long to animate \(over 5,000 lines\)/)).toBeVisible();
		await expect(sceneCount(page, 0)).toBeVisible();
		await context.close();
	});

	test("on a 360 px phone every placeholder is read whole", async ({ browser }) => {
		// A touch device, because the field is 16px under `pointer: coarse` (iOS zooms
		// anything smaller): the room it gives its text is measured at that size.
		const context = await browser.newContext({
			viewport: { width: 360, height: 780 },
			hasTouch: true,
			isMobile: true,
		});
		const page = await context.newPage();
		await page.goto("/");
		await expect(page.locator(".lp-field")).toHaveCSS("font-size", "16px");
		const field = page.getByRole("textbox", { name: /paste a/i });
		for (const mode of ["pull request", "diff", "snippet"]) {
			await page.locator("label.lp-mode", { hasText: mode }).click();
			// The room the field gives its text against the room the placeholder needs,
			// in the field's own font: a placeholder is cut at the edge, never wrapped.
			const { room, needs, text } = await field.evaluate((element) => {
				const textarea = element as HTMLTextAreaElement;
				const style = getComputedStyle(textarea);
				const context = document.createElement("canvas").getContext("2d");
				if (!context) {
					throw new Error("no canvas");
				}
				context.font = `${style.fontSize} ${style.fontFamily}`;
				return {
					room: textarea.clientWidth,
					needs: context.measureText(textarea.placeholder).width,
					text: textarea.placeholder,
				};
			});
			expect(needs, `"${text}" in ${room}px`).toBeLessThanOrEqual(room + 1);
		}
		await context.close();
	});
});

/**
 * #268 / gate-five D1: what a visitor types or pastes never changes the page's
 * width. `field-sizing: content` once let a typed link grow its grid column, so
 * a 21-character link pushed a 390px phone to 409px and the hero's own example
 * link to 591px, and at 1440 the field ran over the engine.
 */
const LONG_LINK =
	"github.com/some-organisation/a-repository-with-a-long-name/pull/1234567890/files";
const DIFF = [
	"diff --git a/src/a.ts b/src/a.ts",
	"--- a/src/a.ts",
	"+++ b/src/a.ts",
	"@@ -1,2 +1,2 @@",
	"-const a = 1;",
	"+const a = 2; // and a trailing comment that is much longer than a phone is wide",
].join("\n");

const WIDTHS = [
	{ width: 360, height: 780 },
	{ width: 390, height: 844 },
	{ width: 768, height: 1024 },
	// Both sides of the `minmax(0, 6fr) minmax(0, 5fr)` switch at 960px.
	{ width: 960, height: 800 },
	{ width: 1024, height: 768 },
	{ width: 1440, height: 900 },
] as const;

/**
 * The smoke budget is 20 s: only the cases that fail on main, plus one multiline
 * guard, carry @smoke. The rest run in the nightly `pnpm e2e`.
 */
const SMOKE = new Set(["link at 390", "link at 1024", "link at 1440", "diff at 1024"]);

test.describe("Landing: the hero's field never widens the page", () => {
	for (const { width, height } of WIDTHS) {
		for (const kind of ["link", "diff"] as const) {
			test(
				`${kind === "link" ? "a 90-character link" : "a pasted multi-line diff"} at ${width}px`,
				{
					tag: SMOKE.has(`${kind} at ${width}`) ? "@smoke" : [],
				},
				async ({ browser }) => {
					const context = await browser.newContext({
						viewport: { width, height },
						hasTouch: width < 768,
						isMobile: width < 768,
					});
					const page = await context.newPage();
					await page.goto("/");
					const field = page.getByRole("textbox", { name: /paste a/i });
					const column = page.locator(".lp-hero-copy");
					await expect(field).toBeVisible();
					// Settled: the reveal moves the column while it plays.
					await expect(async () => {
						expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
					}).toPass();
					const before = await column.boundingBox();

					if (kind === "link") {
						expect(LONG_LINK.length).toBeGreaterThanOrEqual(80);
						await field.pressSequentially(LONG_LINK, { delay: 0 });
					} else {
						await field.fill(DIFF);
					}

					const measure = await page.evaluate(() => {
						const rect = (selector: string) => {
							const box = document.querySelector(selector)?.getBoundingClientRect();
							if (!box) {
								throw new Error(`no ${selector}`);
							}
							return { left: box.left, right: box.right, width: box.width };
						};
						return {
							scrollWidth: document.documentElement.scrollWidth,
							innerWidth: window.innerWidth,
							column: rect(".lp-hero-copy"),
							field: rect(".lp-field"),
							cta: rect(".lp-field-cta"),
							instrument: rect(".lp-hero-instrument"),
						};
					});
					expect(measure.scrollWidth, "the page scrolls sideways").toBe(measure.innerWidth);
					expect(measure.column.width, "the column grew").toBeCloseTo(before?.width ?? 0, 0);
					expect(measure.field.right, "the field leaves its column").toBeLessThanOrEqual(
						measure.column.right + 0.5,
					);
					expect(measure.cta.right, "the button leaves the field").toBeLessThanOrEqual(
						measure.field.right,
					);
					expect(measure.cta.right, "the button is off screen").toBeLessThanOrEqual(width);
					// Side by side (960px and up): the field never reaches the engine.
					if (width >= 960) {
						expect(measure.field.right, "the field covers the engine").toBeLessThanOrEqual(
							measure.instrument.left,
						);
					}
					await context.close();
				},
			);
		}
	}
});

/**
 * The studio's import status is a toast: it covers no control, on any shell
 * (verify-gate-findings D8, #202). The corner row is the header on every width
 * under 1280px; from 1280px the desktop header owns the top 76px.
 */
const SHELLS = [
	{ name: "390 phone", width: 390, height: 844 },
	{ name: "375 phone", width: 375, height: 812 },
	{ name: "360 phone", width: 360, height: 780 },
	{ name: "1100 wide", width: 1100, height: 800 },
	// The desktop shell keeps its line (#192): 76px, under the header.
	{ name: "1280 desktop", width: 1280, height: 800 },
	{ name: "1440 desktop", width: 1440, height: 900 },
] as const;

/** DESKTOP_SCENE_MIN_WIDTH (scene-stage.ts): where the header stops being the corner row. */
const DESKTOP_MIN_WIDTH = 1280;

test.describe("The import status over the ceiling, on every shell", () => {
	for (const shell of SHELLS) {
		test(
			`at ${shell.name} the status covers no header control and is read whole`,
			{ tag: "@smoke" },
			async ({ browser }, testInfo) => {
				const context = await browser.newContext({
					viewport: { width: shell.width, height: shell.height },
				});
				const page = await context.newPage();
				await page.goto("/app");
				await page.evaluate((source) => {
					sessionStorage.setItem("typelapse:import-intent", JSON.stringify({ source }));
					location.hash = "#import=~";
				}, codeOfLines(6000));

				const status = page.getByTestId("import-status");
				await expect(status).toContainText(/too long to animate \(over 5,000 lines\)/);
				// The enter spring has settled once the pill stops moving.
				await expect(async () => {
					const first = await status.boundingBox();
					await page.waitForTimeout(120);
					expect(await status.boundingBox()).toEqual(first);
				}).toPass();

				const box = await status.boundingBox();
				if (!box) throw new Error("the status has no box");
				const desktop = shell.width >= DESKTOP_MIN_WIDTH;
				if (desktop) {
					expect(box.y).toBeCloseTo(76, 0);
				}
				const header = desktop ? ".studio-camera-header" : ".sc-corner-row";
				const controls = page.locator(
					`${header} :is(button, a, input, [role='button'], [role='combobox'])`,
				);
				const count = await controls.count();
				expect(count).toBeGreaterThan(desktop ? 2 : 4);
				for (let index = 0; index < count; index += 1) {
					const control = controls.nth(index);
					const rect = await control.boundingBox();
					if (!rect || rect.width === 0) continue;
					const apart =
						rect.y + rect.height <= box.y + 0.5 ||
						box.y + box.height <= rect.y + 0.5 ||
						rect.x + rect.width <= box.x + 0.5 ||
						box.x + box.width <= rect.x + 0.5;
					const label = await control.evaluate(
						(element) =>
							element.getAttribute("aria-label") ?? element.textContent ?? element.tagName,
					);
					expect(apart, `the status covers "${label}"`).toBe(true);
				}

				// Whole: the words wrap onto more lines rather than end in an ellipsis.
				const text = status.getByTestId("import-status-text");
				expect(
					await text.evaluate((element) => element.scrollWidth <= element.clientWidth),
					"the text is cut",
				).toBe(true);
				expect(await text.evaluate((element) => getComputedStyle(element).textOverflow)).not.toBe(
					"ellipsis",
				);
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.x + box.width).toBeLessThanOrEqual(shell.width);

				await page.screenshot({
					path: testInfo.outputPath(`import-status-${shell.width}.png`),
				});
				await context.close();
			},
		);
	}
});
