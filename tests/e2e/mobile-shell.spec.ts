import { type Locator, type Page, devices } from "@playwright/test";
import { STAGE_TOP_GAP } from "../../src/application/layout/phone-sheet";
import { measureCornerRow } from "./support/corner-row";
import { GREET_DIFF, quadrantPng } from "./support/fixtures";
import { codeFor, newAccount } from "./support/hosted";
import {
	addSource,
	expect,
	hitBox,
	importHash,
	oneSceneHash,
	openShowcase,
	openStudio,
	settled,
	shareHash,
	test,
} from "./support/studio";

/**
 * This file runs in both profiles: `pnpm e2e` (local, no account) and `pnpm e2e:hosted`
 * (a hosted build with its API, where the account exists). The phone's corner row was
 * only ever measured in the first, and in the second a fifth chip covered the project
 * menu's button (#222, design audit 2026-10-08 D3).
 */
const HOSTED_PROFILE = process.env.E2E_PROFILE === "hosted";

// A phone: 390 px wide, touch, a mobile user agent. Chromium only, like the rest.
const { defaultBrowserType: _engine, ...phone } = devices["iPhone 13"];
test.use({ ...phone, viewport: { width: 390, height: 844 } });

/** A notch's status bar, in CSS pixels: the safe area an iPhone with a Dynamic Island reports. */
const NOTCH = 47;
/** The corner row's margin from the top and its height (phone-sheet.ts keeps both private). */
const ROW_MARGIN = 10;
const ROW_HEIGHT = 40;

/** A snippet of `count` lines, past the studio's 5,000-line ceiling when it is large enough. */
function linesOfCode(count: number): string {
	return Array.from({ length: count }, (_, i) => `const value${i} = compute(${i});`).join("\n");
}

/** Raise the sheet to its scenes stop and capture the live code `count` times. */
async function captureScenes(page: Page, count: number) {
	const sheet = page.getByRole("dialog", { name: "Code and scenes" });
	// A fresh studio opens on the scenes stop already (#270): a tap there would raise it past it.
	const handle = page.locator("[data-vaul-handle]");
	if ((await handle.getAttribute("aria-valuetext")) === "Collapsed") {
		await handle.tap();
	}
	await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
	for (let scenes = 1; scenes <= count; scenes++) {
		// With no scene yet the fork's "Capture this code" is the one Capture control.
		await sheet
			.getByRole("button", { name: scenes === 1 ? "Capture this code" : "Capture", exact: true })
			.tap();
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
		await sheet.getByRole("button", { name: "Capture this code", exact: true }).tap();
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
		// The frame hangs under the corner row at every stop (D4): the sheet slides under it.
		expect(scenesBox).toEqual(peekBox);

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

	// The Export tab is the tallest panel and the one with the primary action. On a short phone
	// its scroller is 106px (375x667): a pinned Render row, its note and a Capture shortcut
	// came to 119px and left nothing to scroll to, so Format, Size, FPS, Where and PNG could
	// not be reached (#244). Every control in it can be scrolled into view and answers a press
	// at its centre, at the shortest phone and at a tall one, where Render stays pinned.
	for (const { width, height } of [
		{ width: 375, height: 667 },
		{ width: 390, height: 844 },
	]) {
		test(`every Export control can be scrolled into view and hit, at ${width}x${height}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await openStudio(page);
			await captureScenes(page, 1);
			await page.locator(".si-cta").tap();
			const panel = page.locator(".si-sheet");
			await expect(panel).toBeVisible();
			await settled(panel);

			const controls = panel.locator(".si-sheet-body button");
			const count = await controls.count();
			// Format 3, Size 3, FPS 3, Where, PNG, Render. Where offers two in either build:
			// This device and Server locally, This device and Cloud hosted, where Cloud is
			// listed signed out too and gated at the press (ux-waves D3).
			expect(count).toBe(13);
			for (let index = 0; index < count; index++) {
				const control = controls.nth(index);
				const name = (await control.textContent())?.trim() ?? `control ${index}`;
				const hit = await control.evaluate((element) => {
					element.scrollIntoView({ block: "center" });
					const box = element.getBoundingClientRect();
					const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
					return { answers: at === element || element.contains(at), height: box.height };
				});
				expect(hit.answers, `${name} answers a press at its centre`).toBe(true);
				expect(hit.height, `${name} is 44px tall`).toBeGreaterThanOrEqual(43);
			}
		});
	}

	// Render greyed with nothing pointing at it is a button that looks broken (D16): with no
	// scene, the reason and its Capture shortcut are the first thing in the Export tab, inside
	// the scroller's own viewport at scroll 0, on the shortest phone and a tall one.
	for (const { width, height } of [
		{ width: 375, height: 667 },
		{ width: 390, height: 844 },
	]) {
		test(`the reason Render is off is the first thing in the Export tab, at ${width}x${height}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await openStudio(page);
			await page.locator(".si-cta").tap();
			const panel = page.locator(".si-sheet");
			await expect(panel).toBeVisible();
			await settled(panel);

			const reason = panel.getByText("A video needs at least one scene.");
			await expect(reason).toBeVisible();
			const inside = await reason.evaluate((element) => {
				const body = element.closest(".si-sheet-body");
				if (!body) return false;
				const area = body.getBoundingClientRect();
				const box = element.getBoundingClientRect();
				return body.scrollTop === 0 && box.top >= area.top && box.bottom <= area.bottom;
			});
			expect(inside, "the reason is in the scroller's viewport at scroll 0").toBe(true);
			await expect(panel.getByRole("button", { name: "Capture a scene" })).toBeVisible();
		});
	}

	// Opening a panel lowers the sheet, and the panel then rises from the instrument: Frame
	// and Look are taller than the room between the frame and the island, and used to cover
	// the frame (a top at y 400 and 416 under a frame ending at 451, ticket #187). Each
	// panel is capped to that room, which the sheet's own math gives, and scrolls inside.
	// The third run puts a notch and a home indicator on the phone: the room follows them.
	const insets = { top: 47, bottom: 34, left: 0, right: 0 };
	// The frame now hangs under the corner row (D4), so a 390 phone leaves every panel the
	// room it needs; a short phone is where the tallest two still have to scroll.
	for (const { width, height, notch, short } of [
		{ width: 390, height: 844, notch: false, short: false },
		{ width: 375, height: 812, notch: false, short: false },
		{ width: 390, height: 844, notch: true, short: false },
		{ width: 360, height: 640, notch: false, short: true },
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
				// On a short phone Frame and Look are the two taller than the room under the
				// frame: both scroll, and Motion and Export need not.
				if (!short) return;
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

	// The corner row under a thumb (#282, D10): the project chip is one button, Undo, Redo,
	// Add source and More are 44px columns that fill the row, and no control's reach runs into
	// a neighbour's, measured by asking the page what answers at every pixel. Showcase,
	// Library and the way home live in the More menu. The name keeps "Untitled" whole, down to
	// 360, the most common Android width (#167, #182).
	for (const [width, height] of [
		[360, 780],
		[390, 844],
		[430, 932],
	] as const) {
		test(
			`every control of the corner row is a 44px target and the row has no dead zone, at ${width}x${height}`,
			// The narrowest width runs in the smoke set.
			width === 360 ? { tag: "@smoke" } : {},
			async ({ page }) => {
				await page.setViewportSize({ width, height });
				await openStudio(page);
				// Two edits and one undo: Undo and Redo are both live.
				await addSource(page, "Add text");
				await addSource(page, "Add text");
				await page.getByRole("button", { name: "Undo" }).tap();
				await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
				const project = page.getByRole("button", { name: /^Open project menu/ });
				await settled(project);
				// The word is measured in the face it ships in, not in the fallback it waits in.
				await page.evaluate(() => document.fonts.ready);

				const { controls, deadZones } = await measureCornerRow(page);
				// A renamed, added or missing control fails here instead of being skipped by the loop.
				expect(controls.map((control) => control.label)).toEqual([
					"Open project menu, Untitled",
					"Undo",
					"Redo",
					"Add source",
					"More actions",
				]);
				for (const control of controls) {
					const { label, reach, box } = control;
					expect(reach.width, `"${label}" reaches ${reach.width} wide`).toBeGreaterThanOrEqual(44);
					expect(reach.height, `"${label}" reaches ${reach.height} tall`).toBeGreaterThanOrEqual(
						44,
					);
					expect(control.edgesHit, `"${label}" does not answer at its edges`).toBe(true);
					expect(control.foreign, `"${label}" reaches into a neighbour`).toBe(0);
					expect(box.x + box.width, `"${label}" ends past the screen`).toBeLessThanOrEqual(width);
				}
				expect(Math.max(0, ...deadZones), `dead zones ${deadZones.join(", ")}`).toBeLessThanOrEqual(
					4,
				);

				// Nothing in the chip hangs past its edge, and the name is whole.
				const fit = await page.locator(".sc-corner-row .sc-project").evaluate((chip) => {
					const name = chip.querySelector(".sc-project-name");
					return {
						chip: { scroll: chip.scrollWidth, client: chip.clientWidth },
						name: { scroll: name?.scrollWidth ?? 0, client: name?.clientWidth ?? 0 },
					};
				});
				expect(fit.chip.scroll, "the project chip overflows").toBeLessThanOrEqual(fit.chip.client);
				expect(
					fit.name.scroll,
					`the name is cut: Untitl… (${fit.name.scroll} in ${fit.name.client})`,
				).toBeLessThanOrEqual(fit.name.client);
			},
		);
	}

	test("the browse actions and the way home are in More, and the project is renamed in its menu", async ({
		page,
	}) => {
		await openStudio(page);
		const row = page.locator(".sc-corner-row");
		await expect(row.getByRole("button", { name: "Showcase" })).toHaveCount(0);
		await expect(row.getByRole("button", { name: "Library" })).toHaveCount(0);
		await expect(row.getByRole("link", { name: "Typelapse home" })).toHaveCount(0);
		await expect(row.getByRole("textbox", { name: "Project name" })).toHaveCount(0);

		const more = page.getByRole("button", { name: "More actions" });
		await more.tap();
		const menu = page.locator(".sc-utility-overflow-menu");
		// The account first, then the resources the row gave up, then the file actions.
		const rows = await menu.locator("> :is(button, a) > span").allTextContents();
		expect(rows.slice(0, 4)).toEqual([
			"Showcase",
			"Library",
			"Export project file",
			"Copy share link",
		]);
		expect(rows.at(-1)).toBe("Back to home");
		// A row's own height is the target: 44px, once the menu has finished arriving.
		await settled(menu);
		for (const name of ["Showcase", "Library"]) {
			const box = await menu.getByRole("button", { name, exact: true }).boundingBox();
			expect(box?.height).toBeGreaterThanOrEqual(44);
		}

		// One tap opens the sheet and closes the menu; the sheet hands focus back to More.
		await menu.getByRole("button", { name: "Showcase", exact: true }).tap();
		await expect(page.getByRole("dialog", { name: "Showcase" })).toBeVisible();
		await expect(menu).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: "Showcase" })).toBeHidden();
		await expect(more).toBeFocused();
		await more.tap();
		await menu.getByRole("button", { name: "Library", exact: true }).tap();
		await expect(page.getByRole("dialog", { name: "Capture library" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: "Capture library" })).toBeHidden();
		await expect(more).toBeFocused();

		// Escape closes the menu and puts focus back on its button, as before.
		await more.tap();
		await expect(menu).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await expect(more).toBeFocused();

		// The chip is one button; its menu holds the name as a field, outside the menu role.
		const chip = page.getByRole("button", { name: /^Open project menu/ });
		await chip.tap();
		const project = page.getByRole("region", { name: "Project" });
		const name = project.getByRole("textbox", { name: "Project name" });
		await expect(
			page.getByRole("menu", { name: "Local projects" }).getByRole("textbox"),
		).toHaveCount(0);
		await settled(project);
		const field = await name.boundingBox();
		expect(field?.height).toBeGreaterThanOrEqual(44);
		// It types at 16px under a finger, or iOS zooms into it and stays zoomed (D10).
		expect(await name.evaluate((input) => getComputedStyle(input).fontSize)).toBe("16px");

		// A tap focuses it, and a real name saves as it is typed.
		await name.tap();
		await expect(name).toBeFocused();
		await name.fill("Release notes");
		await expect(
			page.getByRole("button", { name: "Open project menu, Release notes" }),
		).toBeVisible();

		// Enter puts the keyboard away and leaves the menu open.
		await name.press("Enter");
		await expect(name).not.toBeFocused();
		await expect(project).toBeVisible();

		// An emptied field is a draft: Enter settles it on "Untitled".
		await name.fill("");
		await name.press("Enter");
		await expect(page.getByRole("button", { name: "Open project menu, Untitled" })).toBeVisible();

		// Escape closes the menu and puts the focus back on the chip.
		await name.tap();
		await page.keyboard.press("Escape");
		await expect(project).toHaveCount(0);
		await expect(chip).toBeFocused();
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
			insets: { top: NOTCH, bottom: 34, left: 0, right: 0 },
		});
		await openStudio(page);
		await addSource(page, "Add text");
		await page.evaluate((hash) => {
			window.location.hash = hash;
		}, importHash(GREET_DIFF));

		const strip = page.getByRole("alertdialog");
		await expect(strip).toBeVisible();
		const box = await strip.boundingBox();
		// Under the notch and the corner row, where the stage starts (D6).
		expect(box?.y).toBeGreaterThanOrEqual(NOTCH + ROW_HEIGHT + STAGE_TOP_GAP);
	});

	// One placement rule for every transient surface under 1280px (#207, DECISIONS
	// after-the-gate D6): below the corner row and above the stage, stacked downward as the
	// import pill or the replace question, then the notices. None covers a control, none
	// covers another.
	for (const { width, height } of [
		{ width: 390, height: 844 },
		{ width: 375, height: 812 },
	]) {
		for (const surface of ["pill", "replace question"] as const) {
			test(
				`the ${surface} and a notice stack under the corner row without touching a control, at ${width}px`,
				// One surface and one width run in the smoke set.
				surface === "pill" && width === 390 ? { tag: "@smoke" } : {},
				async ({ page }, testInfo) => {
					await page.emulateMedia({ reducedMotion: "reduce" });
					await page.setViewportSize({ width, height });
					await openStudio(page);

					let first: Locator;
					if (surface === "pill") {
						// A paste over the ceiling: the pill reports it and stays until dismissed.
						await page.evaluate((source) => {
							sessionStorage.setItem("typelapse:import-intent", JSON.stringify({ source }));
							location.hash = "#import=~";
						}, linesOfCode(6000));
						first = page.getByTestId("import-status");
						await expect(first).toContainText(/too long to animate/);
					} else {
						// Typed edits are work to lose, so the import link asks first.
						await addSource(page, "Add text");
						await page.evaluate((hash) => {
							window.location.hash = hash;
						}, importHash(GREET_DIFF));
						first = page.getByRole("alertdialog").locator(".sc-confirm-float");
						await expect(first).toBeVisible();
					}

					await page.locator('input[type="file"][accept=".json"]').setInputFiles({
						name: "broken.json",
						mimeType: "application/json",
						buffer: Buffer.from("not a project"),
					});
					const notice = page.getByTestId("notice");
					await expect(notice).toBeVisible();
					await settled(first);
					await settled(notice);

					const firstBox = await first.boundingBox();
					const noticeBox = await notice.boundingBox();
					if (!firstBox || !noticeBox) throw new Error("a surface has no box");
					// The row ends at its margin and height, and the stage starts a gap under it.
					const stageTop = ROW_MARGIN + ROW_HEIGHT + STAGE_TOP_GAP;
					expect(firstBox.y, `the ${surface} starts at ${firstBox.y}`).toBeGreaterThanOrEqual(
						stageTop - 0.5,
					);
					expect(noticeBox.y, `the notice starts at ${noticeBox.y}`).toBeGreaterThanOrEqual(
						firstBox.y + firstBox.height - 0.5,
					);

					const controls = page.locator(".sc-corner-row :is(button, a, input)");
					const count = await controls.count();
					expect(count).toBeGreaterThan(5);
					for (const [name, box] of [
						[surface, firstBox],
						["notice", noticeBox],
					] as const) {
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
							expect(apart, `the ${name} covers "${label}"`).toBe(true);
						}
					}

					await page.screenshot({
						path: testInfo.outputPath(`surfaces-${surface.replace(" ", "-")}-${width}.png`),
					});
				},
			);
		}
	}

	// The replace question's two buttons were 32px tall with no reach, in the Showcase and in
	// every popover that asks it: under a thumb they are 44px each way, drawn at 32.
	test("the replace question's buttons are 44px each way under a thumb", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openStudio(page);
		await addSource(page, "Add text");
		await openShowcase(page, { touch: true });
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
				(mode) => window.localStorage.setItem("typelapse.studio-appearance", mode),
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

			await page.getByRole("menuitem", { name: "Paste a link" }).tap();
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
				(mode) => window.localStorage.setItem("typelapse.studio-appearance", mode),
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
				.locator(".sc-utility-overflow-menu > button, .sc-more-account button")
				.evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).offsetHeight));
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.filter((height) => height < 44)).toEqual([]);
			// The appearance's three segments are drawn at 32px and reach the row's 44 (D6).
			const appearance = page.getByRole("group", { name: "Appearance" });
			for (const name of ["Light", "Dark", "System"]) {
				const reach = await hitBox(appearance.getByRole("button", { name }));
				expect(reach.height, `${name} reaches ${reach.height} tall`).toBeGreaterThanOrEqual(44);
			}
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
				(mode) => window.localStorage.setItem("typelapse.studio-appearance", mode),
				theme,
			);
			await openStudio(page, oneSceneHash());
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
		await openShowcase(page, { touch: true });
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		await openStudio(page, oneSceneHash());
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
		for (let index = 0; index < 6; index++) {
			await openShowcase(page, { touch: true });
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

// Design audit 2026-10-08, D3 and D4: the corner row holds four chips in both profiles, a
// long title never pushes the project menu's button under a neighbour and reads in full
// in the menu, and the frame takes the stage's width under the row at every stop.
test.describe("Mobile shell: the corner row and the frame after the design audit", () => {
	const TITLE = "feat(render): stream hosted renders to R2 with resumable parts";

	for (const width of [360, 390, 412]) {
		test(`a long title leaves every control of the row reachable, at ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 844 });
			await openStudio(page);
			await expect(page.locator(".sc-corner-row > *")).toHaveCount(4);
			await expect(page.locator(".sc-corner-row .sc-account-island")).toHaveCount(0);
			// The name is renamed in the project menu, and the chip says it on its one button.
			await page.getByRole("button", { name: /^Open project menu/ }).tap();
			const menu = page.getByRole("menu", { name: "Local projects" });
			const name = page.getByRole("region", { name: "Project" }).getByRole("textbox", {
				name: "Project name",
			});
			await name.fill(TITLE);
			await name.blur();
			await expect(name).toHaveValue(TITLE);
			const create = menu.getByRole("menuitem", { name: "New project" });
			await expect(create).toBeVisible();
			const reachable = await create.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
				return hit === element || element.contains(hit);
			});
			expect(reachable).toBe(true);
			await page.keyboard.press("Escape");
			await expect(menu).toHaveCount(0);
			await page.evaluate(() => document.fonts.ready);

			const row = await page.locator(".sc-corner-row").evaluate((element) => {
				const chip = element.querySelector(".sc-project");
				const controls = [...element.querySelectorAll<HTMLElement>("button:not(:disabled), a")];
				return {
					chip: chip ? { scroll: chip.scrollWidth, client: chip.clientWidth } : null,
					missed: controls
						.filter((control) => {
							const box = control.getBoundingClientRect();
							const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
							return !(hit === control || control.contains(hit));
						})
						.map((control) => control.getAttribute("aria-label") ?? control.tagName),
				};
			});
			expect(row.chip?.scroll).toBeLessThanOrEqual(row.chip?.client ?? 0);
			expect(row.missed, "controls under another control").toEqual([]);
		});
	}

	test("the frame takes the stage's width under the row and holds still at every stop", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openStudio(page);
		const frame = page.getByTestId("preview-frame");
		const handle = page.getByRole("slider", { name: "Sheet height" });
		const boxes = [];
		for (const key of ["Home", "ArrowUp", "End"]) {
			await handle.press(key);
			await settled(frame);
			boxes.push(await frame.boundingBox());
		}
		const [peek] = boxes;
		if (!peek) throw new Error("no frame");
		expect(peek.x).toBeCloseTo(8, 0);
		expect(peek.y).toBeCloseTo(ROW_MARGIN + ROW_HEIGHT + STAGE_TOP_GAP, 0);
		expect(peek.width).toBeCloseTo(374, 0);
		expect(peek.height).toBeCloseTo(210.4, 0);
		for (const box of boxes) expect(box).toEqual(peek);
	});

	test("signs in from the More menu: the address, then the code", async ({ page }) => {
		test.skip(!HOSTED_PROFILE, "accounts exist in the hosted profile only");
		const account = newAccount("phone-menu");
		await page.setExtraHTTPHeaders({ "x-forwarded-for": account.clientIp });
		await openStudio(page);
		await page.getByRole("button", { name: "More actions" }).tap();
		const signIn = page.getByRole("button", { name: "Sign in", exact: true });
		await expect(signIn).toBeEnabled();
		await signIn.tap();
		const panel = page.getByRole("region", { name: "Sign in to Typelapse" });
		const email = panel.getByRole("textbox", { name: "Email" });
		// A finger types where it taps: opening the form does not raise the keyboard, and the
		// field is 16px so the page does not zoom into it (the forms checklist).
		await expect(email).not.toBeFocused();
		await expect(email).toHaveAttribute("placeholder", "you@company.com");
		expect(await email.evaluate((field) => getComputedStyle(field).fontSize)).toBe("16px");
		await email.fill(account.email);
		const since = new Date();
		await panel.getByRole("button", { name: "Email me a code" }).tap();
		const codeField = panel.getByRole("textbox", { name: "Code" });
		await expect(codeField).toHaveAttribute("placeholder", "123456");
		await expect(codeField).not.toBeFocused();
		await expect(panel.getByRole("heading", { name: "Check your email." })).toBeFocused();
		expect(await codeField.evaluate((field) => getComputedStyle(field).fontSize)).toBe("16px");
		const code = await codeFor(account.email, since);
		await codeField.fill(code);
		await expect(page.getByRole("button", { name: `Account for ${account.name}` })).toBeVisible();
		await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
		// Still four chips once signed in.
		await expect(page.locator(".sc-corner-row > *")).toHaveCount(4);
	});
});

/** A file the phone cannot read at rest: 40 lines of 170 columns. */
const WIDE_FILE = Array.from({ length: 40 }, (_, row) => {
	const head = `const row${String(row + 1).padStart(2, "0")} = "`;
	return `${head}${"lorem ipsum dolor ".repeat(10).slice(0, 170 - head.length - 2)}";`;
}).join("\n");

/** The code's size as the eye gets it: its font size times every scale it is drawn at. */
function effectiveCodePx(page: Page): Promise<number> {
	return page
		.locator("[data-code-canvas]")
		.first()
		.evaluate(
			(code: HTMLElement) =>
				Number.parseFloat(getComputedStyle(code).fontSize) *
				(code.getBoundingClientRect().width / code.offsetWidth),
		);
}

const codeWindow = (page: Page) => page.locator("[data-preview-frame] .code-frame-glow");
const loupeSlot = (page: Page) => page.locator(".sc-stage-slot");

/** Tap the middle of the frame and wait for the loupe to settle open. */
async function openTheLoupe(page: Page) {
	const frame = page.locator("[data-preview-frame]");
	await settled(frame);
	const box = await frame.boundingBox();
	if (!box) throw new Error("no frame");
	await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
	await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
	await settled(codeWindow(page));
}

/** A one-finger drag, with the mouse: Playwright's touchscreen only taps. */
async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 12 });
	// Held still, so the release carries no speed and the bounds are what it settles on.
	await page.waitForTimeout(150);
	await page.mouse.up();
}

/** The loupe is shut again, the frame back at rest and focus on the way in. */
async function expectShut(page: Page) {
	await expect(loupeSlot(page)).not.toHaveAttribute("data-loupe", /.*/);
	await expect(page.getByRole("button", { name: "Magnify the code" })).toBeFocused();
	const frame = page.locator("[data-preview-frame]");
	await settled(frame);
	const box = await frame.boundingBox();
	expect(box?.x).toBeCloseTo(8, 0);
	expect(box?.width).toBeCloseTo(374, 0);
}

// Design audit 2026-10-08, D5: a 1080p frame at 374px draws its code at 2 to 6px.
// A tap magnifies the same DOM picture to an 11px floor (application/layout/code-loupe.ts).
test.describe("Mobile shell: the code is read through a loupe", () => {
	test("a tap brings the code to 11px and puts the chrome aside", async ({ page }) => {
		await openStudio(page);
		await settled(codeWindow(page));
		const rest = await effectiveCodePx(page);
		expect(rest, "the frame's code is under the floor at rest").toBeLessThan(11);
		await openTheLoupe(page);
		const open = await effectiveCodePx(page);
		expect(open).toBeGreaterThanOrEqual(11 - 0.01);
		test.info().annotations.push({
			type: "code px",
			description: `${rest.toFixed(2)} -> ${open.toFixed(2)}`,
		});

		// The corner row, the instrument and the sheet are gone from the keyboard, the
		// accessibility tree and the finger: a press where the row was lands on the loupe.
		for (const chrome of [".sc-corner-row", ".sc-dock-slot", ".sc-sheet"]) {
			await expect(page.locator(chrome)).toHaveAttribute("inert", "");
		}
		const undo = page.getByRole("button", { name: "Undo" });
		await undo.evaluate((button: HTMLElement) => button.focus());
		await expect(undo).not.toBeFocused();
		const rowLandsOnLoupe = await page.evaluate(() => {
			const row = document.querySelector(".sc-corner-row")?.getBoundingClientRect();
			if (!row) return false;
			const hit = document.elementFromPoint(row.left + 60, row.top + row.height / 2);
			return hit?.closest(".sc-stage-slot") != null;
		});
		expect(rowLandsOnLoupe).toBe(true);
		const done = page.getByRole("button", { name: "Done" });
		await expect(done).toBeVisible();
		expect((await done.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	});

	test("a 40-line, 170-column file opens on column 1 at 11px and pans inside its bounds", async ({
		page,
	}) => {
		await openStudio(page, importHash(WIDE_FILE));
		await expect(page.locator("[data-export-target] span", { hasText: "row40" })).toBeAttached();
		const rest = await effectiveCodePx(page);
		await openTheLoupe(page);
		const open = await effectiveCodePx(page);
		expect(open).toBeGreaterThanOrEqual(11 - 0.01);
		test.info().annotations.push({
			type: "code px",
			description: `${rest.toFixed(2)} -> ${open.toFixed(2)}`,
		});
		// Column 1 is read first: the window's left edge sits 12px from the screen's.
		let box = await codeWindow(page).boundingBox();
		if (!box) throw new Error("no window");
		expect(box.x).toBeCloseTo(12, 0);
		expect(box.width).toBeGreaterThan(390);

		// Pulled right past its edge, it springs back to the margin.
		await drag(page, { x: 100, y: 400 }, { x: 260, y: 0 });
		await settled(codeWindow(page));
		box = await codeWindow(page).boundingBox();
		expect(box?.x).toBeCloseTo(12, 0);

		// Dragged left as far as it goes, it stops with its right edge 12px in.
		for (let pass = 0; pass < 4; pass++) await drag(page, { x: 380, y: 400 }, { x: -370, y: 0 });
		await settled(codeWindow(page));
		box = await codeWindow(page).boundingBox();
		if (!box) throw new Error("no window");
		expect(box.x + box.width).toBeCloseTo(390 - 12, 0);

		// Up as far as it goes: its foot stops 12px above the view's, 24px over the screen's foot.
		for (let pass = 0; pass < 4; pass++) await drag(page, { x: 200, y: 780 }, { x: 0, y: -600 });
		await settled(codeWindow(page));
		box = await codeWindow(page).boundingBox();
		if (!box) throw new Error("no window");
		expect(box.y + box.height).toBeCloseTo(844 - 24 - 12, 0);
		// A pan never closes it.
		await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
	});

	test("a tap closes it, and focus comes back to the frame", async ({ page }) => {
		await openStudio(page);
		await openTheLoupe(page);
		await page.touchscreen.tap(195, 700);
		await expectShut(page);
		await expect(page.locator(".sc-corner-row")).not.toHaveAttribute("inert", /.*/);
	});

	test("a pull down past the top closes it", async ({ page }) => {
		await openStudio(page);
		await openTheLoupe(page);
		await drag(page, { x: 195, y: 300 }, { x: 0, y: 300 });
		await expectShut(page);
	});

	test("Done closes it", async ({ page }) => {
		await openStudio(page);
		await openTheLoupe(page);
		await page.getByRole("button", { name: "Done" }).tap();
		await expectShut(page);
	});

	test("the keyboard opens it, pans it a step an arrow and closes it with Escape", async ({
		page,
	}) => {
		await openStudio(page, importHash(WIDE_FILE));
		await expect(page.locator("[data-export-target] span", { hasText: "row40" })).toBeAttached();
		await settled(page.locator("[data-preview-frame]"));
		await page.getByRole("button", { name: "Magnify the code" }).focus();
		await page.keyboard.press("Enter");
		await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
		await settled(codeWindow(page));
		expect(await effectiveCodePx(page)).toBeGreaterThanOrEqual(11 - 0.01);
		const before = await codeWindow(page).boundingBox();
		await page.keyboard.press("ArrowRight");
		// One-to-one and instant (D8): 48px on the next frame, no spring to wait for.
		const next = await codeWindow(page).evaluate(
			(element) =>
				new Promise<number>((resolve) =>
					requestAnimationFrame(() =>
						requestAnimationFrame(() => resolve(element.getBoundingClientRect().x)),
					),
				),
		);
		expect((before?.x ?? 0) - next).toBeCloseTo(48, 0);
		await settled(codeWindow(page));
		expect((await codeWindow(page).boundingBox())?.x).toBeCloseTo(next, 1);
		await page.keyboard.press("Escape");
		await expectShut(page);
	});

	test("under reduced motion the picture swaps at once", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openStudio(page);
		const frame = page.locator("[data-preview-frame]");
		await settled(frame);
		const box = await frame.boundingBox();
		if (!box) throw new Error("no frame");
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		// Two frames after the tap the picture is where it ends: nothing travels.
		const rect = (element: Element) => {
			const r = element.getBoundingClientRect();
			return [r.x, r.y, r.width, r.height].map((n) => n.toFixed(1)).join();
		};
		const first = await frame.evaluate(
			(element) =>
				new Promise<string>((resolve) =>
					requestAnimationFrame(() =>
						requestAnimationFrame(() => {
							const r = element.getBoundingClientRect();
							resolve([r.x, r.y, r.width, r.height].map((n) => n.toFixed(1)).join());
						}),
					),
				),
		);
		await page.waitForTimeout(600);
		await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
		expect(await frame.evaluate(rect)).toBe(first);
		// And it did change: the frame two frames in is already the magnified one.
		expect(Number(first.split(",")[2])).toBeGreaterThan(box.width * 1.2);
		expect(await effectiveCodePx(page)).toBeGreaterThanOrEqual(11 - 0.01);

		// A pan is a pan under reduced motion too: the release lands at once, and the
		// picture never fades out and back (only opening and closing fade).
		await page.waitForTimeout(300);
		await drag(page, { x: 300, y: 400 }, { x: -120, y: 0 });
		const opacities = await loupeSlot(page).evaluate(
			(slot) =>
				new Promise<string[]>((resolve) => {
					const seen: string[] = [];
					const tick = () => {
						seen.push(getComputedStyle(slot).opacity);
						if (seen.length < 6) requestAnimationFrame(tick);
						else resolve(seen);
					};
					tick();
				}),
		);
		expect(new Set(opacities)).toEqual(new Set(["1"]));
	});

	test("once shut, nothing of its clip is left: a 9:16 frame shows to its foot", async ({
		page,
	}) => {
		await openStudio(page, oneSceneHash());
		await openTheLoupe(page);
		await page.getByRole("button", { name: "Done" }).tap();
		await expectShut(page);
		await expect
			.poll(() => loupeSlot(page).evaluate((slot) => getComputedStyle(slot).clipPath))
			.toBe("none");

		await page.getByRole("button", { name: "Settings" }).tap();
		await page.getByRole("button", { name: "Aspect ratio 9:16", exact: true }).tap();
		await page.getByRole("button", { name: "Close settings" }).tap();
		const frame = page.locator("[data-preview-frame]");
		await settled(frame);
		const box = await frame.boundingBox();
		if (!box) throw new Error("no frame");
		expect(box.height).toBeGreaterThan(box.width);
		// The rest box the clip was left at was 16:9, 210px tall: the 9:16 frame's foot
		// is far below it, and a press there has to reach the frame.
		const footIsTheFrame = await page.evaluate(
			({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-preview-frame]") != null,
			{ x: box.x + box.width / 2, y: box.y + box.height - 4 },
		);
		expect(footIsTheFrame).toBe(true);
	});

	test("its keys are its own: Space opens, arrows pan, Escape closes, and playback is untouched", async ({
		page,
	}) => {
		await openStudio(
			page,
			shareHash({
				title: "Two scenes",
				code: "const a = 1;",
				language: "typescript",
				themeName: "nord",
				background: "mesh:ocean",
				steps: [
					{ code: "const a = 1;", duration: 4000 },
					{ code: "const a = 1;\nconst b = 2;", duration: 4000 },
				],
			}),
		);
		const firstScene = page.getByRole("button", { name: "Scene 1 of 2" });
		await expect(firstScene).toHaveAttribute("aria-current", "step");
		await settled(page.locator("[data-preview-frame]"));
		const target = page.getByRole("button", { name: "Magnify the code" });

		// Space on the frame opens the loupe; it does not start playback.
		await target.focus();
		await page.keyboard.press(" ");
		await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeAttached();
		// An arrow pans the picture; it does not change the scene.
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowLeft");
		await expect(firstScene).toHaveAttribute("aria-current", "step");
		await page.keyboard.press("Escape");
		await expectShut(page);
		await expect(firstScene).toHaveAttribute("aria-current", "step");

		// Playing, Escape closes the loupe and the video keeps playing.
		await page.getByRole("button", { name: "Play", exact: true }).tap();
		await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeAttached();
		await target.focus();
		await page.keyboard.press("Enter");
		await expect(loupeSlot(page)).toHaveAttribute("data-loupe", "open");
		await page.keyboard.press("Escape");
		await expectShut(page);
		await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeAttached();
	});

	test("its bounds follow the picture: a scene growing from 3 to 40 lines while open pans to its foot", async ({
		page,
	}) => {
		const short = ["const a = 1;", "const b = 2;", "const c = 3;"].join("\n");
		const tall = Array.from({ length: 40 }, (_, row) => `const value${row} = ${row};`).join("\n");
		await openStudio(
			page,
			shareHash({
				title: "Growing",
				code: short,
				language: "typescript",
				themeName: "nord",
				background: "mesh:ocean",
				steps: [
					{ code: short, duration: 600 },
					{ code: tall, duration: 60_000 },
				],
			}),
		);
		await expect(page.getByRole("button", { name: "Scene 1 of 2" })).toHaveAttribute(
			"aria-current",
			"step",
		);
		await page.getByRole("button", { name: "Play", exact: true }).tap();
		await openTheLoupe(page);
		// The second scene holds once the morph has run.
		await expect(page.locator("[data-export-target] span", { hasText: "value39" })).toBeAttached();
		await page.waitForTimeout(1500);
		await settled(codeWindow(page));

		for (let pass = 0; pass < 4; pass++) await drag(page, { x: 200, y: 780 }, { x: 0, y: -600 });
		await settled(codeWindow(page));
		const box = await codeWindow(page).boundingBox();
		if (!box) throw new Error("no window");
		// The bounds are the 40-line window's, not the 3-line one the loupe opened on:
		// taller than the view, its foot reaches the view's foot less the margin;
		// shorter, it sits whole inside the view, centred.
		const view = { top: 58, bottom: 844 - 24 };
		if (box.height + 24 > view.bottom - view.top) {
			expect(box.y + box.height).toBeCloseTo(view.bottom - 12, 0);
		} else {
			expect(box.y - view.top).toBeCloseTo(view.bottom - (box.y + box.height), 0);
		}
	});
});

/**
 * An empty project opens on its path (#270): the sheet rests on the scenes stop from the
 * first frame, so the fork of the empty scene is on screen with no gesture, and the code
 * editor (a megabyte of Monaco) is still not asked for until the Edit stop.
 */
test.describe("Mobile shell: an empty project opens on its path", () => {
	const MONACO = /\/assets\/(monaco-runtime|editor\.worker|ts\.worker)-/;
	const FORK = [/^Capture this code$/, /^Start from an example/, /^Import a pull request/];

	for (const [width, height] of [
		[390, 844],
		[360, 740],
	] as const) {
		test(`the fork's three actions are on screen and hittable, with no scroll or drag, at ${width}x${height}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			const monaco: string[] = [];
			page.on("request", (request) => {
				if (MONACO.test(request.url())) monaco.push(request.url());
			});
			await openStudio(page);
			const handle = page.getByRole("slider", { name: "Sheet height" });
			await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
			await settled(page.locator(".sc-sheet"));

			for (const name of FORK) {
				const action = page.getByRole("button", { name });
				await expect(action).toBeVisible();
				const box = await action.boundingBox();
				if (!box) throw new Error(`no box for ${name}`);
				expect(box.y, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
				expect(box.y + box.height, `${name} ends on screen`).toBeLessThanOrEqual(height);
				const hit = await hitBox(action, 0);
				expect(hit.width, `${name} is not covered`).toBeGreaterThanOrEqual(box.width - 1);
				expect(hit.height, `${name} is not covered`).toBeGreaterThanOrEqual(box.height - 1);
			}
			await page.waitForLoadState("networkidle");
			expect(monaco, "no editor before the Edit stop").toEqual([]);
		});
	}

	test("the sheet is at its stop on the first frame it is drawn, never slid there", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			const w = window as unknown as { __tops: number[] };
			w.__tops = [];
			const frame = () => {
				const top = document.querySelector(".sc-sheet")?.getBoundingClientRect().top;
				const dock = document.querySelector(".sc-dock-slot")?.getBoundingClientRect().top;
				if (top !== undefined && dock !== undefined) {
					w.__tops.push(Math.round(top * 10) / 10, Math.round(dock * 10) / 10);
				}
				requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		});
		await openStudio(page);
		await settled(page.locator(".sc-sheet"));
		const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops);
		expect(tops.length).toBeGreaterThan(10);
		// Pairs: the sheet's top, then the instrument slot's, on every frame since the studio
		// was drawn. Neither moves: the instrument is where it rests from the first frame.
		const sheets = tops.filter((_, index) => index % 2 === 0);
		const docks = tops.filter((_, index) => index % 2 === 1);
		expect(new Set(sheets), "the sheet's top, every frame").toEqual(new Set([sheets[0]]));
		expect(new Set(docks), "the instrument's top, every frame").toEqual(new Set([docks[0]]));
	});

	test("an import link opens at the peek: a scene is on its way", async ({ page }) => {
		await openStudio(page, importHash(GREET_DIFF));
		await expect(page.getByRole("slider", { name: "Sheet height" })).toHaveAttribute(
			"aria-valuetext",
			"Collapsed",
		);
	});

	test("the code's title waits for a code: not drawn on the scenes stop of an empty project", async ({
		page,
	}) => {
		await openStudio(page);
		const section = page.locator("[data-editor-section]");
		await settled(page.locator(".sc-sheet"));
		await expect(section).toHaveCSS("opacity", "0");
		await expect(section).toHaveJSProperty("inert", true);
		// It keeps its room: raising the sheet shows it where it was.
		await page.getByRole("slider", { name: "Sheet height" }).press("End");
		await expect(section).toHaveCSS("opacity", "1");
	});

	test("a project with a scene still opens at the peek", async ({ page }) => {
		await openStudio(page, oneSceneHash());
		await expect(page.getByRole("slider", { name: "Sheet height" })).toHaveAttribute(
			"aria-valuetext",
			"Collapsed",
		);
	});

	test("the first scene taken from the fork leaves the sheet where it is", async ({ page }) => {
		await openStudio(page);
		const handle = page.getByRole("slider", { name: "Sheet height" });
		const sheet = page.getByRole("dialog", { name: "Code and scenes" });
		await page.getByRole("button", { name: /^Capture this code$/ }).tap();
		await expect(sheet.getByText(/^1 scene$/)).toBeVisible();
		await expect(handle).toHaveAttribute("aria-valuetext", "Half open");
	});
});

// A cursor's row is what it was (#282): the move into More and the one-button project chip
// answer to the pointer, not to the width, so a narrow window with a mouse and the desktop
// shell keep every control where it was.
test.describe("Mobile shell: a fine pointer keeps the corner row it had", () => {
	test.use({ hasTouch: false, isMobile: false });

	for (const [width, height] of [
		[390, 844],
		[1440, 900],
	] as const) {
		test(`Showcase, Library, the logo and the name field stay in the row, at ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await openStudio(page);
			const row = page.locator(width < 640 ? ".sc-corner-row" : "body");
			for (const name of ["Showcase", "Library", "Add source", "Undo", "Redo"]) {
				await expect(row.getByRole("button", { name, exact: true }).first()).toBeVisible();
			}
			await expect(page.getByRole("link", { name: "Typelapse home" })).toBeVisible();
			await expect(page.getByRole("textbox", { name: "Project name" })).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Open project menu", exact: true }),
			).toBeVisible();
			if (width < 640) {
				await page.getByRole("button", { name: "More actions" }).click();
				const menu = page.locator(".sc-utility-overflow-menu");
				await expect(menu.getByRole("button", { name: "Showcase", exact: true })).toHaveCount(0);
				await expect(menu.getByRole("button", { name: "Library", exact: true })).toHaveCount(0);
				await expect(menu.getByRole("link", { name: "Back to home" })).toHaveCount(0);
			}
		});
	}
});
