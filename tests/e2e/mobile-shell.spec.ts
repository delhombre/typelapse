import { type Page, devices } from "@playwright/test";
import { GREET_DIFF, quadrantPng } from "./support/fixtures";
import { addSource, expect, hitBox, importHash, openStudio, settled, test } from "./support/studio";

// A phone: 390 px wide, touch, a mobile user agent. Chromium only, like the rest.
const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
test.use({ ...phone, viewport: { width: 390, height: 844 } });

/** Raise the sheet to its scenes stop and capture the live code `count` times. */
async function captureScenes(page: Page, count: number) {
	const sheet = page.getByRole("dialog", { name: "Code and scenes" });
	await page.locator("[data-vaul-handle]").tap();
	for (let scenes = 1; scenes <= count; scenes++) {
		await sheet.getByRole("button", { name: "Capture", exact: true }).tap();
		await expect(sheet.getByText(new RegExp(`^${scenes} scenes?$`))).toBeVisible();
	}
}

test.describe("Mobile shell: the studio works with a thumb at 390 px", () => {
	test("capture, drop a photo, go back to the code, undo the photo", async ({ page }) => {
		await openStudio(page);
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await expect(sheet).toBeVisible();
		await expect(page.getByRole("region", { name: "Studio resources" })).toBeVisible();

		// Raise the sheet to the scenes stop, then capture the live code.
		await page.locator("[data-vaul-handle]").tap();
		await sheet.getByRole("button", { name: "Capture", exact: true }).tap();
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();

		// A photo dropped anywhere lands in the selected scene.
		const dataTransfer = await page.evaluateHandle((base64) => {
			const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
			const transfer = new DataTransfer();
			transfer.items.add(new File([bytes], "quadrants.png", { type: "image/png" }));
			return transfer;
		}, quadrantPng().toString("base64"));
		const stage = page.locator(".sc-stage");
		await stage.dispatchEvent("dragenter", { dataTransfer });
		await stage.dispatchEvent("dragover", { dataTransfer });
		await stage.dispatchEvent("drop", { dataTransfer });
		await expect(page.getByRole("button", { name: "Edit image layer" })).toBeVisible();

		// The dropped photo is picked: its inspector takes the code's place in the
		// sheet, and the Code chip is the way back.
		await expect(sheet.getByRole("button", { name: "quadrants.png", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toBeVisible();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toHaveCount(0);
		await sheet.getByRole("button", { name: "Code", exact: true }).tap();
		await expect(sheet.getByRole("textbox", { name: "Editor content" })).toBeAttached();
		await expect(sheet.getByRole("button", { name: "Delete image layer" })).toHaveCount(0);

		// Undo takes the photo back out.
		await page.getByRole("button", { name: "Undo" }).tap();
		await expect(page.getByRole("button", { name: "Edit image layer" })).toHaveCount(0);
		await expect(sheet.getByText(/^1 scenes?$/)).toBeVisible();
	});

	// A hidden box is still a scroll container, and a clipped one is not (DECISIONS D15):
	// on a phone a focus or a scrollIntoView must not be able to slide the studio
	// under its own corner row either.
	test("the root clips and never scrolls, even with something hanging off its edge", async ({
		page,
	}) => {
		await openStudio(page);
		const scrollLeft = await page.locator("main.studio-root").evaluate((root) => {
			const overhang = document.createElement("div");
			overhang.style.cssText = "position:absolute;top:0;left:100%;width:200px;height:10px";
			root.append(overhang);
			root.scrollLeft = 200;
			const moved = root.scrollLeft;
			overhang.remove();
			return moved;
		});
		expect(scrollLeft).toBe(0);
	});

	// The phone root once carried a few of the desktop's colour tokens and none of its
	// material, so the project menu painted no background at all: the stage showed
	// through its rows. Every menu on the root reads the same material.
	test("a menu paints the studio's material, not the stage behind it", async ({ page }) => {
		await openStudio(page);
		await page.locator(".sc-project-trigger").tap();
		const menu = page.locator(".sc-project-menu");
		await expect(menu).toBeVisible();
		const fill = await menu.evaluate((element) => getComputedStyle(element).backgroundColor);
		expect(fill).not.toBe("rgba(0, 0, 0, 0)");
		const shadow = await menu.evaluate((element) => getComputedStyle(element).boxShadow);
		expect(shadow).not.toBe("none");
	});

	// Opening the export panel used to ask the stage's slot for 460px more than the screen
	// has left, and the card refit to a box of nothing: 107x64 became 672x264 at a negative
	// offset (ticket #169). A panel never resizes the stage; it lowers the sheet to the peek,
	// where the frame has room above the panel, and gives the stop back when it closes (D4).
	test("the export panel lowers the sheet to the peek and the frame stays above it", async ({
		page,
	}) => {
		await openStudio(page);
		await captureScenes(page, 1);
		const card = page.locator("[data-export-target]");
		const handle = page.getByRole("slider", { name: "Sheet height" });

		// The peek's box, measured on its own, to hold the panel's against.
		await handle.press("Home");
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
		await settled(card);
		const peekBox = await card.boundingBox();
		await handle.press("ArrowUp");
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await settled(card);
		const scenesBox = await card.boundingBox();
		expect(scenesBox).not.toEqual(peekBox);

		await page.locator(".si-cta").tap();
		const panel = page.locator(".si-sheet");
		await expect(panel).toBeVisible();
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
		await settled(card);
		await settled(panel);
		const open = await card.boundingBox();
		expect(open).toEqual(peekBox);
		expect(open?.x).toBeGreaterThanOrEqual(0);
		expect(open?.y).toBeGreaterThanOrEqual(0);
		const panelBox = await panel.boundingBox();
		if (!open || !panelBox) throw new Error("no card or panel");
		expect(open.y + open.height, "the frame ends above the panel").toBeLessThanOrEqual(panelBox.y);

		await page.getByRole("button", { name: "Close settings" }).tap();
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await settled(card);
		expect(await card.boundingBox()).toEqual(scenesBox);
	});

	// Opening a panel lowers the sheet, and the panel then rises from the instrument: Frame
	// and Look are taller than the room between the frame and the island, and used to cover
	// the frame (a top at y 400 and 416 under a frame ending at 451, ticket #187). Each
	// panel is capped to that room, which the sheet's own math gives, and scrolls inside.
	// The third run puts a notch and a home indicator on the phone: the room follows them.
	const insets = { top: 47, bottom: 34, left: 0, right: 0 };
	for (const { width, height, notch } of [
		{ width: 390, height: 844, notch: false },
		{ width: 375, height: 812, notch: false },
		{ width: 390, height: 844, notch: true },
	]) {
		const label = `${width}x${height}${notch ? " with a notch" : ""}`;
		test(
			`every island panel stays under the frame and scrolls inside, at ${label}`,
			// One viewport runs in the smoke set.
			width === 390 && !notch ? { tag: "@smoke" } : {},
			async ({ page }) => {
				await page.setViewportSize({ width, height });
				if (notch) {
					const cdp = await page.context().newCDPSession(page);
					await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
				}
				await openStudio(page);
				await captureScenes(page, 1);
				// The frame is the picture the panel must not cover: the mesh box, not the
				// code window inside it.
				const frame = page.getByTestId("preview-frame");
				const panel = page.locator(".si-sheet");
				const body = page.locator(".si-sheet-body");
				await page.locator(".si-cta").tap();
				await expect(panel).toBeVisible();

				const gap = 8;
				const scrolls: string[] = [];
				for (const tab of ["Frame", "Look", "Motion", "Export"]) {
					await panel.getByRole("button", { name: tab, exact: true }).tap();
					await expect(panel).toHaveAttribute("data-cluster", tab.toLowerCase());
					await settled(frame);
					await settled(panel);
					const cardBox = await frame.boundingBox();
					const panelBox = await panel.boundingBox();
					if (!cardBox || !panelBox) throw new Error(`no frame or panel on ${tab}`);
					const frameEnds = cardBox.y + cardBox.height;
					expect(
						panelBox.y,
						`${tab} starts at ${panelBox.y}, the frame ends at ${frameEnds}`,
					).toBeGreaterThanOrEqual(frameEnds + gap - 0.5);

					// Taller than its room, the controls scroll inside the panel and the tabs stay put.
					const scroll = await body.evaluate((element) => {
						const overflow = getComputedStyle(element).overflowY;
						const taller = element.scrollHeight > element.clientHeight + 1;
						element.scrollTop = element.scrollHeight;
						const moved = element.scrollTop;
						element.scrollTop = 0;
						return { overflow, taller, moved };
					});
					if (scroll.taller) {
						scrolls.push(tab);
						expect(["auto", "scroll"], `${tab} is taller and does not scroll`).toContain(
							scroll.overflow,
						);
						expect(scroll.moved, `${tab} did not scroll`).toBeGreaterThan(0);
						const tabs = await panel.locator(".si-sheet-tabs").boundingBox();
						expect(tabs?.y).toBeCloseTo(panelBox.y, 0);
					}
				}
				// Frame and Look are the two taller than the room under the frame, here and on a
				// shorter phone: both scroll, and Motion and Export need not.
				expect(scrolls).toEqual(expect.arrayContaining(["Frame", "Look"]));

				// Changing a control in a scrolled panel leaves it where it is.
				await panel.getByRole("button", { name: "Look", exact: true }).tap();
				// The tab that left is still in the body, fading, until it has gone.
				await expect(body.locator(".si-cluster")).toHaveCount(1);
				await settled(panel);
				await body.evaluate((element) => {
					element.scrollTop = element.scrollHeight;
				});
				const scrolledTo = await body.evaluate((element) => element.scrollTop);
				expect(scrolledTo).toBeGreaterThan(0);
				await panel.getByRole("button", { name: "Fira", exact: true }).tap();
				await expect(panel.getByRole("button", { name: "Fira", exact: true })).toHaveAttribute(
					"aria-pressed",
					"true",
				);
				await settled(panel);
				expect(await body.evaluate((element) => element.scrollTop)).toBe(scrolledTo);

				// A tab opens at its top, not where the last one was left scrolled to.
				await panel.getByRole("button", { name: "Frame", exact: true }).tap();
				await expect(panel).toHaveAttribute("data-cluster", "frame");
				await settled(panel);
				expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
			},
		);
	}

	// The Showcase's replace question holds a picture, two paragraphs and a card of
	// its own. On a short phone the sheet is 74% of the screen, and the block was
	// clipped by it with nothing a finger could scroll: "Open example" sat below the
	// fold, out of reach. (A hidden box scrolls for a script, not for a thumb, so the
	// check reads what clips and whether anything between the button and the sheet
	// is a scroller. Reduced motion keeps the entrance's own offsets out of the
	// measure.)
	// The island under a thumb (ticket #140). Its scene dots were 24px wide and Export 31px
	// tall, so a press landed on the neighbour or on nothing. The reach is what the page
	// answers to by `elementFromPoint`, not a box: a hit area is a pseudo-element, and the
	// island clips whatever grows past it.
	for (const width of [390, 375]) {
		test(`the island's targets are 44px each way under a thumb, at ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 812 });
			await openStudio(page);
			await captureScenes(page, 3);
			const island = page.locator(".si-island");
			await settled(island);

			const targets = {
				Play: page.getByRole("button", { name: "Play" }),
				"Scene 1": page.getByRole("button", { name: "Scene 1 of 3" }),
				"Scene 2": page.getByRole("button", { name: "Scene 2 of 3" }),
				"Scene 3": page.getByRole("button", { name: "Scene 3 of 3" }),
				Settings: page.getByRole("button", { name: "Settings" }),
				Social: page.getByRole("button", { name: /^Social preview/ }),
				Export: island.locator(".si-cta"),
			};
			for (const [name, target] of Object.entries(targets)) {
				const reach = await hitBox(target);
				expect(reach.width, `${name} reaches ${reach.width} wide`).toBeGreaterThanOrEqual(44);
				expect(reach.height, `${name} reaches ${reach.height} tall`).toBeGreaterThanOrEqual(44);
			}

			// And the island holds all of it: nothing is cut by its own clip or the screen's.
			const fit = await island.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const cta = element.querySelector(".si-cta")?.getBoundingClientRect();
				return {
					left: box.left,
					right: window.innerWidth - box.right,
					ctaInside: cta ? box.right - cta.right : -1,
				};
			});
			expect(fit.left).toBeGreaterThanOrEqual(8);
			expect(fit.right).toBeGreaterThanOrEqual(8);
			expect(fit.ctaInside).toBeGreaterThanOrEqual(0);
		});
	}

	// The project chip's menu trigger is a 24px glyph that grows into the 2px and the 8px gap
	// beside it, 44px tall under a thumb; and the name keeps "Untitled" whole at 390 (#167).
	test("the project chip's menu trigger is a thumb's target and the name keeps its first word", async ({
		page,
	}) => {
		await openStudio(page);
		const trigger = page.locator(".sc-project-trigger");
		const name = page.getByRole("textbox", { name: "Project name" });
		await settled(trigger);

		const reach = await hitBox(trigger);
		expect(reach.height, `the trigger reaches ${reach.height} tall`).toBeGreaterThanOrEqual(44);
		expect(reach.width, `the trigger reaches ${reach.width} wide`).toBeGreaterThanOrEqual(24);
		expect((await trigger.boundingBox())?.width).toBeGreaterThanOrEqual(24);

		await expect(name).toHaveValue("Untitled");
		const clipped = await name.evaluate((field) => field.scrollWidth > field.clientWidth);
		expect(clipped, "the name is cut: Untitl…").toBe(false);
	});

	// Four scenes are one more than the island has room for at 44px each, so the counter
	// says the position, as it already does from the fifth on a pointer's phone.
	test("past its dots the island keeps its targets and its fit, and the counter says where it is", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await openStudio(page);
		await captureScenes(page, 4);
		const island = page.locator(".si-island");
		await settled(island);

		await expect(island.locator(".si-count")).toHaveText("04 / 04");
		await expect(island.locator(".si-dot")).toHaveCount(0);
		for (const target of [
			page.getByRole("button", { name: "Play" }),
			page.getByRole("button", { name: "Settings" }),
			page.getByRole("button", { name: /^Social preview/ }),
			island.locator(".si-cta"),
		]) {
			const reach = await hitBox(target);
			expect(reach.width).toBeGreaterThanOrEqual(44);
			expect(reach.height).toBeGreaterThanOrEqual(44);
		}
		const room = await island.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const cta = element.querySelector(".si-cta")?.getBoundingClientRect();
			return { right: window.innerWidth - box.right, ctaInside: cta ? box.right - cta.right : -1 };
		});
		expect(room.right).toBeGreaterThanOrEqual(8);
		expect(room.ctaInside).toBeGreaterThanOrEqual(0);
	});

	// The question an import link raises floats at the top of the screen, which on a phone is
	// where the status bar and the Dynamic Island are: it starts below them like every other
	// piece of phone chrome (DECISIONS D14).
	test("the question an import link raises clears the notch", async ({ page }) => {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Emulation.setSafeAreaInsetsOverride", {
			insets: { top: 47, bottom: 34, left: 0, right: 0 },
		});
		await openStudio(page);
		await addSource(page, "Add text");
		await page.evaluate((hash) => {
			window.location.hash = hash;
		}, importHash(GREET_DIFF));

		const strip = page.getByRole("alertdialog");
		await expect(strip).toBeVisible();
		const box = await strip.boundingBox();
		expect(box?.y).toBeGreaterThanOrEqual(47);
	});

	// The replace question's two buttons were 32px tall with no reach, in the Showcase and in
	// every popover that asks it: under a thumb they are 44px each way, drawn at 32.
	test("the replace question's buttons are 44px each way under a thumb", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openStudio(page);
		await addSource(page, "Add text");
		await page.getByRole("button", { name: "Showcase", exact: true }).tap();
		await page.locator(".showcase-card").first().tap();

		for (const name of ["Keep my snippet", "Open example"]) {
			const button = page.getByRole("button", { name });
			await expect(button).toBeVisible();
			await settled(button);
			const reach = await hitBox(button);
			expect(reach.height, `${name} reaches ${reach.height} tall`).toBeGreaterThanOrEqual(44);
			expect(reach.width, `${name} reaches ${reach.width} wide`).toBeGreaterThanOrEqual(44);
		}
	});

	// A menu that holds rows of text covers the stage on a phone, and at 88% the mesh showed
	// through its lower rows as a blotch (DECISIONS D5, next-wave D6). The project menu, the
	// source menu and its popover are the opaque studio surface, in both themes.
	for (const theme of ["light", "dark"] as const) {
		test(`the menus that hold text are opaque, ${theme}`, async ({ page }) => {
			await page.addInitScript(
				(mode) => window.localStorage.setItem("typelapse.studio-theme", mode),
				theme,
			);
			await openStudio(page);
			const paint = (selector: string) =>
				page.locator(selector).evaluate((element) => {
					const style = getComputedStyle(element);
					const slash = style.backgroundColor.match(/\/\s*([\d.]+)(%?)\s*\)/);
					const rgba = style.backgroundColor.match(/^rgba\(([^)]*)\)/);
					const alpha = slash
						? Number(slash[1]) / (slash[2] ? 100 : 1)
						: rgba
							? Number(rgba[1]?.split(",")[3] ?? 1)
							: 1;
					return { alpha, blur: style.backdropFilter };
				});

			await page.locator(".sc-project-trigger").tap();
			await expect(page.locator(".sc-project-menu")).toBeVisible();
			expect(await paint(".sc-project-menu")).toEqual({ alpha: 1, blur: "none" });

			await page.getByRole("button", { name: "Add source" }).tap();
			await expect(page.locator(".sc-source-menu")).toBeVisible();
			expect(await paint(".sc-source-menu")).toEqual({ alpha: 1, blur: "none" });

			await page.getByRole("menuitem", { name: "Import from URL" }).tap();
			await expect(page.locator(".sc-source-form-popover")).toBeVisible();
			expect(await paint(".sc-source-form-popover")).toEqual({ alpha: 1, blur: "none" });
		});
	}

	// The More menu holds text too (second phone pass, #153): the same opaque surface, and its
	// rows a finger's height. (The account panel is hosted only; its journey is in
	// hosted/account.spec.ts.) The sheet is portaled out of the
	// root, so it reads the root's warm tokens by being named beside it, not by a copy.
	for (const theme of ["light", "dark"] as const) {
		test(`the More menu is opaque, and the sheet is warm, ${theme}`, async ({ page }) => {
			await page.addInitScript(
				(mode) => window.localStorage.setItem("typelapse.studio-theme", mode),
				theme,
			);
			await openStudio(page);
			const paint = (selector: string) =>
				page.locator(selector).evaluate((element) => {
					const style = getComputedStyle(element);
					const slash = style.backgroundColor.match(/\/\s*([\d.]+)(%?)\s*\)/);
					const rgba = style.backgroundColor.match(/^rgba\(([^)]*)\)/);
					const alpha = slash
						? Number(slash[1]) / (slash[2] ? 100 : 1)
						: rgba
							? Number(rgba[1]?.split(",")[3] ?? 1)
							: 1;
					return { alpha, blur: style.backdropFilter, border: style.borderTopWidth };
				});

			await page.getByRole("button", { name: "More actions" }).tap();
			await expect(page.locator(".sc-utility-overflow-menu")).toBeVisible();
			expect(await paint(".sc-utility-overflow-menu")).toEqual({
				alpha: 1,
				blur: "none",
				border: "0px",
			});
			const rows = await page
				.locator(".sc-utility-overflow-menu button")
				.evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).offsetHeight));
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.filter((height) => height < 44)).toEqual([]);
			await page.getByRole("button", { name: "More actions" }).tap();

			const tokens = (selector: string) =>
				page.locator(selector).evaluate((element) => {
					const style = getComputedStyle(element);
					return ["--camera-ink", "--camera-pill", "--camera-muted", "--camera-focus"].map((name) =>
						style.getPropertyValue(name).trim(),
					);
				});
			const root = await tokens(".sc-root-mobile");
			expect(root.every((value) => value !== "")).toBe(true);
			expect(await tokens(".sc-sheet")).toEqual(root);
		});
	}

	// The sheet holds text at every stop, so it is the opaque studio surface too (#160): at 92%
	// with a blur the stage's mesh showed through it. Read at the peek, the scenes stop and the
	// full stop, where the drawer has moved it, in both themes.
	for (const theme of ["light", "dark"] as const) {
		test(`the sheet is opaque at every stop, ${theme}`, async ({ page }) => {
			await page.addInitScript(
				(mode) => window.localStorage.setItem("typelapse.studio-theme", mode),
				theme,
			);
			await openStudio(page);
			const handle = page.locator("[data-vaul-handle]");
			await handle.focus();
			for (const text of ["Collapsed", "Half open", "Open"]) {
				await expect(handle).toHaveAttribute("aria-valuetext", text);
				const paint = await page.locator(".sc-sheet").evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						background: style.backgroundColor,
						blur: style.backdropFilter,
						border: style.borderTopWidth,
					};
				});
				expect(paint, text).toEqual({
					background: theme === "light" ? "rgb(255, 255, 255)" : "rgb(30, 28, 26)",
					blur: "none",
					border: "0px",
				});
				await handle.press("ArrowUp");
			}
		});
	}

	test("a short phone can still answer the Showcase's replace question", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 375, height: 600 });
		await openStudio(page);
		await addSource(page, "Add text");
		await page.getByRole("button", { name: "Showcase", exact: true }).tap();
		await page.locator(".showcase-card").first().tap();

		const open = page.getByRole("button", { name: "Open example" });
		await expect(open).toBeVisible();
		const confirm = await page.locator(".showcase-confirm").evaluate((element) => ({
			overflows: element.scrollHeight > element.clientHeight + 1,
			overflowY: getComputedStyle(element).overflowY,
		}));
		expect(confirm).toEqual({ overflows: true, overflowY: "auto" });

		const clippers = await open.evaluate((button) => {
			const found: string[] = [];
			for (let el = button.parentElement; el; el = el.parentElement) {
				const overflow = getComputedStyle(el).overflowY;
				if (
					(overflow === "hidden" || overflow === "clip") &&
					el.scrollHeight > el.clientHeight + 1
				) {
					found.push(`${el.className}: ${overflow}`);
				}
				if (el.matches(".studio-sheet-panel")) break;
			}
			return found;
		});
		expect(clippers).toEqual([]);
	});
});

/**
 * The phone's sheet and its instrument move as one (ticket #141): the drawer writes the
 * sheet's transform on every pointer move, and the instrument is on the sheet's edge in the
 * same frame. A recorder in the page takes one row per animation frame, so a spec reads the
 * frames, not a screenshot.
 */
test.describe("Mobile shell: the instrument follows the sheet", () => {
	test.use({ viewport: { width: 375, height: 812 } });

	const HOME_INDICATOR = 34;

	async function withNotch(page: Page) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Emulation.setSafeAreaInsetsOverride", {
			insets: { top: 47, bottom: HOME_INDICATOR, left: 0, right: 0 },
		});
		return cdp;
	}

	/** Where the sheet's top edge rests on a stop, read by raising it there with the keys. */
	async function stopTops(page: Page) {
		const handle = page.locator("[data-vaul-handle]");
		const top = () => page.locator(".sc-sheet").evaluate((el) => el.getBoundingClientRect().top);
		const tops: number[] = [];
		await handle.focus();
		for (const text of ["Collapsed", "Half open", "Open"]) {
			await expect(handle).toHaveAttribute("aria-valuetext", text);
			let last = Number.NaN;
			await expect
				.poll(async () => {
					const now = await top();
					const done = now === last;
					last = now;
					return done;
				})
				.toBe(true);
			tops.push(last);
			await page.keyboard.press("ArrowUp");
		}
		await page.keyboard.press("Home");
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
		await expect.poll(top).toBe(tops[0]);
		return tops as [number, number, number];
	}

	/** One row per frame: the sheet's top and the bottom of the instrument's slot. */
	async function record(page: Page) {
		await page.evaluate(() => {
			const w = window as unknown as { __rows: unknown[]; __stop: boolean };
			w.__rows = [];
			w.__stop = false;
			const frame = () => {
				const sheet = document.querySelector(".sc-sheet")?.getBoundingClientRect();
				const slot = document.querySelector(".sc-dock-slot")?.getBoundingClientRect();
				if (sheet && slot) w.__rows.push({ sheetTop: sheet.top, slotBottom: slot.bottom });
				if (!w.__stop) requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		});
		return async () =>
			page.evaluate(() => {
				const w = window as unknown as { __rows: unknown[]; __stop: boolean };
				w.__stop = true;
				return w.__rows as { sheetTop: number; slotBottom: number }[];
			});
	}

	async function touchDrag(
		page: Page,
		cdp: Awaited<ReturnType<typeof withNotch>>,
		to: number,
		hold = 200,
	) {
		const box = await page.locator("[data-vaul-handle]").boundingBox();
		if (!box) throw new Error("no handle");
		const x = box.x + box.width / 2;
		const from = box.y + box.height / 2;
		const point = (y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
		for (let step = 1; step <= 24; step++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: point(from + ((to - from) * step) / 24),
			});
			await page.waitForTimeout(16);
		}
		await page.waitForTimeout(hold);
		return async () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	}

	test("rides 12px above the sheet's edge on every frame of a drag, not only on release", async ({
		page,
	}) => {
		const cdp = await withNotch(page);
		await openStudio(page);
		const [peekTop, scenesTop] = await stopTops(page);
		const stop = await record(page);

		// Half way from the peek to the scenes stop, held with the finger down.
		const handleY = (await page.locator("[data-vaul-handle]").boundingBox())?.y ?? 0;
		const release = await touchDrag(page, cdp, handleY - (peekTop - scenesTop) / 2);
		const held = await stop();
		await release();

		const moved = held.filter((row) => row.sheetTop < peekTop - 4);
		expect(moved.length).toBeGreaterThan(10);
		for (const row of moved) {
			expect(row.sheetTop - row.slotBottom, JSON.stringify(row)).toBeCloseTo(12, 0);
		}
	});

	test("comes down toward the bottom as the sheet goes on past the scenes stop", async ({
		page,
	}) => {
		const cdp = await withNotch(page);
		await openStudio(page);
		const [peekTop, scenesTop, fullTop] = await stopTops(page);
		const height = 812;
		const floor = height - Math.max(12, HOME_INDICATOR);
		const stop = await record(page);

		const handleY = (await page.locator("[data-vaul-handle]").boundingBox())?.y ?? 0;
		// Past the scenes stop, a third of the way to the full one.
		const target = scenesTop - (scenesTop - fullTop) / 3;
		const release = await touchDrag(page, cdp, handleY - (peekTop - target));
		const held = await stop();
		await release();

		const last = held.at(-1);
		if (!last) throw new Error("no frames");
		// The instrument has left the sheet's edge, is above where it was on the scenes stop,
		// and is not yet at the bottom.
		expect(last.sheetTop).toBeLessThan(scenesTop - 20);
		expect(last.slotBottom).toBeGreaterThan(scenesTop - 12);
		expect(last.slotBottom).toBeLessThan(floor);
		// Every frame, on the line the stops draw between the scenes stop and the full one.
		const lift = (visible: number) =>
			visible <= height - scenesTop
				? visible + 12
				: height -
					scenesTop +
					12 +
					(HOME_INDICATOR - (height - scenesTop + 12)) *
						((visible - (height - scenesTop)) / (scenesTop - fullTop));
		for (const row of held.filter((r) => r.sheetTop < scenesTop - 4)) {
			expect(height - row.slotBottom, JSON.stringify(row)).toBeCloseTo(
				lift(height - row.sheetTop),
				-0.3,
			);
		}
	});

	test("stays above the home indicator however far the finger pulls the sheet down", async ({
		page,
	}) => {
		const cdp = await withNotch(page);
		await openStudio(page);
		await stopTops(page);
		await page.keyboard.press("ArrowUp");
		await expect(page.locator("[data-vaul-handle]")).toHaveAttribute("aria-valuetext", "Half open");
		await expect
			.poll(async () =>
				page.locator(".sc-sheet").evaluate((el) => Math.round(el.getBoundingClientRect().top)),
			)
			.toBeLessThan(500);
		const stop = await record(page);
		const release = await touchDrag(page, cdp, 808);
		const held = await stop();
		await release();
		expect(held.length).toBeGreaterThan(10);
		for (const row of held) {
			expect(row.slotBottom, JSON.stringify(row)).toBeLessThanOrEqual(812 - HOME_INDICATOR + 0.5);
		}
	});

	test("lands with the sheet: the same gap on the frame the settle ends", async ({ page }) => {
		await withNotch(page);
		await openStudio(page);
		const handle = page.locator("[data-vaul-handle]");
		await handle.focus();
		const stop = await record(page);
		await page.keyboard.press("Enter");
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await page.waitForTimeout(900);
		const rows = await stop();
		for (const row of rows.filter((r) => r.sheetTop < 700)) {
			// Both run the drawer's own transition from the same write: no frame lags the other by more than a few pixels.
			expect(Math.abs(row.sheetTop - row.slotBottom - 12), JSON.stringify(row)).toBeLessThan(40);
		}
		const end = rows.at(-1);
		expect(end && end.sheetTop - end.slotBottom).toBeCloseTo(12, 0);
	});
});

/** The handle is the way to the content below the peek without a finger (ticket #141). */
test.describe("Mobile shell: the sheet's handle works without a finger", () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test("Tab reaches it, Enter and Space step through the stops, and the content opens", async ({
		page,
	}) => {
		await openStudio(page);
		const handle = page.getByRole("slider", { name: "Sheet height" });
		const sheetTop = () =>
			page.locator(".sc-sheet").evaluate((el) => Math.round(el.getBoundingClientRect().top));
		const content = page.locator("[data-editor-section]").locator("xpath=ancestor::div[@id][1]");

		// Tab until the handle has focus, and never through the sheet's content to get there.
		let reached = false;
		for (let presses = 0; presses < 80 && !reached; presses++) {
			await page.keyboard.press("Tab");
			reached = await handle.evaluate((el) => el === document.activeElement);
			const inside = await page.evaluate(
				() => document.activeElement?.closest("[data-editor-section]") !== null,
			);
			expect(inside, "focus must not land in the collapsed content").toBe(false);
		}
		expect(reached, "Tab reaches the handle").toBe(true);
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
		await expect(content).toHaveJSProperty("inert", true);
		// The sheet slides up to the peek when the studio opens, and Tab can land on the handle
		// while it is still arriving: measured then, the "peek" is 2 or 3px below the rest.
		await settled(page.locator(".sc-sheet"));
		const peek = await sheetTop();
		expect(peek, "the peek rests PEEK px above the bottom of the screen").toBe(812 - 56);

		await page.keyboard.press("Enter");
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await expect(handle).toHaveAttribute("aria-valuenow", "1");
		await expect(content).toHaveJSProperty("inert", false);
		await expect.poll(sheetTop).toBeLessThan(peek - 200);
		const scenes = await sheetTop();

		await page.keyboard.press(" ");
		await expect(handle).toHaveAttribute("aria-valuetext", "Open");
		await expect.poll(sheetTop).toBeLessThan(scenes - 100);

		await page.keyboard.press("Enter");
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
		await expect.poll(sheetTop).toBe(peek);

		// Raised again, the next Tab goes into the content that was below the peek.
		await page.keyboard.press("ArrowUp");
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await page.keyboard.press("Tab");
		const inside = await page.evaluate(
			() => document.activeElement?.closest("[data-editor-section], .sc-sheet") !== null,
		);
		expect(inside).toBe(true);
	});

	test("raises the sheet when focus moves to something below the screen's edge", async ({
		page,
	}) => {
		await openStudio(page);
		const handle = page.getByRole("slider", { name: "Sheet height" });
		await handle.focus();
		await page.keyboard.press("Enter");
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		// Something focusable far down the sheet, where the half stop has no screen.
		await page.evaluate(() => {
			const far = document.createElement("button");
			far.textContent = "Far";
			far.style.marginTop = "900px";
			document.querySelector("[data-editor-section]")?.append(far);
			far.focus();
		});
		await expect(handle).toHaveAttribute("aria-valuetext", "Open");
	});

	test("is a vertical slider in the accessibility tree, with its state and a raise and a lower", async ({
		page,
	}) => {
		await openStudio(page);
		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Accessibility.enable");
		const read = async () => {
			const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
				nodes: {
					role?: { value: string };
					name?: { value: string };
					value?: { value: unknown };
					ignored?: boolean;
					properties?: { name: string; value: { value: unknown } }[];
				}[];
			};
			const node = nodes.find(
				(n) => n.role?.value === "slider" && n.name?.value === "Sheet height",
			);
			if (!node) throw new Error("the handle is not in the accessibility tree");
			const props = Object.fromEntries((node.properties ?? []).map((p) => [p.name, p.value.value]));
			return { ignored: node.ignored ?? false, props, value: node.value?.value };
		};
		const before = await read();
		expect(before.ignored).toBe(false);
		expect(before.props).toMatchObject({ focusable: true, orientation: "vertical" });
		expect(before.props).toMatchObject({ valuemin: 0, valuemax: 2 });
		expect(before.value).toBe(0);
		// The tree's own `valuetext` stays empty in Chromium for every ARIA slider (a bare
		// page shows the same), so the words are read from the attribute a screen reader gets.
		const handle = page.getByRole("slider", { name: "Sheet height" });
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");

		// What an assistive technology's "increment" does is what the arrow does.
		await handle.focus();
		await page.keyboard.press("ArrowUp");
		await expect.poll(async () => (await read()).value).toBe(1);
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
		await page.keyboard.press("ArrowDown");
		await expect.poll(async () => (await read()).value).toBe(0);
		await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
	});
});

/**
 * The Showcase's replace question on a phone: the picture sat on the title (375x812, the
 * picture 293 to 486 and the title 470 to 489) and the portrait project's picture was
 * 640px wide, off the screen.
 */
test.describe("Mobile shell: the Showcase's replace question keeps its parts apart", () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test("no picture runs into its title, none is wider than the screen, and the buttons are in view", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openStudio(page);
		await addSource(page, "Add text");
		const open = page.getByRole("button", { name: "Showcase", exact: true });
		for (let index = 0; index < 6; index++) {
			await open.tap();
			await page.locator(".showcase-card").nth(index).tap();
			const confirm = page.locator(".showcase-confirm");
			await expect(confirm).toBeVisible();
			await settled(confirm.locator(".showcase-artwork"));
			const boxes = await confirm.evaluate((element) => {
				const rect = (selector: string) => {
					const box = element.querySelector(selector)?.getBoundingClientRect();
					if (!box) throw new Error(`no ${selector}`);
					return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
				};
				return {
					picture: rect(".showcase-artwork"),
					title: rect("h3"),
					button: rect("[data-confirm-discard-confirm]"),
					column: element.getBoundingClientRect(),
					scrolls: element.scrollHeight > element.clientHeight + 1,
				};
			});
			const label = `project ${index}`;
			expect(boxes.picture.bottom, `${label}: picture over its title`).toBeLessThanOrEqual(
				boxes.title.top,
			);
			expect(boxes.picture.right, `${label}: picture wider than its column`).toBeLessThanOrEqual(
				boxes.column.right,
			);
			expect(boxes.picture.top, `${label}: picture above its block`).toBeGreaterThanOrEqual(
				boxes.column.top,
			);
			expect(boxes.button.bottom, `${label}: Open example below the fold`).toBeLessThanOrEqual(812);
			expect(boxes.scrolls, `${label}: the question needs no scrolling`).toBe(false);
			await page.getByRole("button", { name: "Back to showcase" }).tap();
			await page.getByRole("button", { name: "Close showcase" }).tap();
			await expect(page.locator(".studio-sheet-panel")).toHaveCount(0);
		}
	});
});
