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
