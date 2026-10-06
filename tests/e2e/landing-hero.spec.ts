import { expect, sceneCount, test } from "./support/studio";

declare global {
	interface Window {
		__from?: number;
	}
}

test.describe("Landing: the hero's paste field", () => {
	test("a pasted snippet arrives in the studio as scene one, ready to play", async ({ page }) => {
		await page.goto("/");
		const code = "const answer = 42;\nconsole.log(answer);";
		await page.getByRole("textbox", { name: /paste a/i }).fill(code);
		await page.getByRole("button", { name: "Import & animate" }).click();
		await expect(page).toHaveURL(/\/app(?:[#?].*)?$/);
		// It used to land on "0 scenes" with Play disabled: the button's promise, broken.
		await expect(sceneCount(page, 1)).toBeVisible();
		const play = page.getByRole("button", { name: "Play timeline" });
		await expect(play).toBeEnabled();
		// And it plays: the clock leaves 00:00.0.
		await play.click();
		await expect(page.getByRole("button", { name: "Pause timeline" })).toBeVisible();
	});

	test("8,000 lines land in the field inside the 200 ms budget, pasted or inserted", async ({
		browser,
	}) => {
		// A real paste (Cmd+V) and `insertText` (an input method, a dictation tool,
		// Playwright's own fill) are different editing commands. The second was
		// 61 s at this size: Chromium's cost, taken over by the field (bulk-insert.ts).
		const context = await browser.newContext({
			permissions: ["clipboard-read", "clipboard-write"],
		});
		const page = await context.newPage();
		await page.goto("/");
		const field = page.getByRole("textbox", { name: /paste a/i });
		const code = Array.from({ length: 8000 }, (_, i) => `const value${i} = compute(${i});`).join(
			"\n",
		);

		// From the event to the second frame after it: what the visitor waits through.
		const settle = () =>
			page.evaluate(
				() =>
					new Promise<number>((resolve) => {
						requestAnimationFrame(() =>
							requestAnimationFrame(() => resolve(performance.now() - (window.__from ?? 0))),
						);
					}),
			);
		const mark = (event: string) =>
			page.evaluate((name) => {
				document.querySelector(".lp-field textarea")?.addEventListener(
					name,
					() => {
						window.__from = performance.now();
					},
					{ once: true, capture: true },
				);
			}, event);

		await page.evaluate((text) => navigator.clipboard.writeText(text), code);
		await field.focus();
		await mark("paste");
		await page.keyboard.press("ControlOrMeta+V");
		const pasted = await settle();
		await expect(field).toHaveValue(code);

		await field.fill("");
		// Playwright's fill is Input.insertText: one `insertText` with the whole text.
		const start = Date.now();
		await field.fill(code);
		const inserted = Date.now() - start;
		await expect(field).toHaveValue(code);

		console.log(
			`8000 lines: paste ${Math.round(pasted)} ms, insertText ${Math.round(inserted)} ms`,
		);
		expect(pasted).toBeLessThan(200);
		expect(inserted).toBeLessThan(200);
		await context.close();
	});

	test("on a 360 px phone every placeholder is read whole", async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 780 });
		await page.goto("/");
		const field = page.getByRole("textbox", { name: /paste a/i });
		for (const mode of ["pull request", "diff", "snippet"]) {
			await page.getByText(mode, { exact: true }).click();
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
	});
});
