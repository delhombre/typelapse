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
