// @vitest-environment jsdom
import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { MobileShell } from "@/presentation/components/layout/mobile-shell";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imports = vi.hoisted(() => ({ importStudioMediaFiles: vi.fn() }));
vi.mock("@/presentation/utils/studio-media-import", () => imports);

function dragEvent(type: string, files: readonly File[] = []) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: { types: ["Files"], files, dropEffect: "none" },
	});
	return event;
}

/**
 * The shell is a phone's: its frame is the stage's width (design audit D4), so
 * jsdom's 1024px window would be a tablet on its side with no scenes stop.
 */
beforeEach(() => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
});

const shell = () =>
	render(
		<MemoryRouter>
			<StudioTooltipProvider>
				<MobileShell editor={<div />} stepBuilder={<div />} preview={<div />} />
			</StudioTooltipProvider>
		</MemoryRouter>,
	);

describe("the phone studio", () => {
	let stopHistory: () => void = () => undefined;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
			}),
		});
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => {
		stopHistory();
		cleanup();
		imports.importStudioMediaFiles.mockReset();
	});

	it("has the project's undo and redo, and they step through its history", () => {
		const before = useSnippetStore.getState().snippet.title;
		stopHistory = studioHistory.start();
		shell();
		const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
		const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;

		act(() => {
			useSnippetStore.getState().setTitle("Edited on a phone");
			studioHistory.capture();
		});
		expect(undo.disabled).toBe(false);

		fireEvent.click(undo);
		expect(useSnippetStore.getState().snippet.title).toBe(before);
		expect(redo.disabled).toBe(false);

		fireEvent.click(redo);
		expect(useSnippetStore.getState().snippet.title).toBe("Edited on a phone");
	});

	it("keeps the appearance and sound one tap away, in the More menu", () => {
		shell();
		expect(screen.queryByRole("group", { name: "Appearance", hidden: true })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "More actions", hidden: true }));

		expect(screen.getByRole("group", { name: "Appearance", hidden: true })).toBeTruthy();
		expect(screen.getByRole("button", { name: /interface feedback/, hidden: true })).toBeTruthy();
	});

	// D6 of the 2026-10-08 design audit: three states, System by default, all in view.
	it("offers Light, Dark and System, marks the one in force, and paints the choice", () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: "More actions", hidden: true }));
		const appearance = screen.getByRole("group", { name: "Appearance", hidden: true });
		const option = (name: string) => within(appearance).getByRole("button", { name, hidden: true });
		const pressed = () =>
			["Light", "Dark", "System"].filter(
				(name) => option(name).getAttribute("aria-pressed") === "true",
			);
		expect(pressed()).toEqual(["System"]);

		fireEvent.click(option("Dark"));
		expect(pressed()).toEqual(["Dark"]);
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		fireEvent.click(option("System"));
		expect(pressed()).toEqual(["System"]);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	// D3: four chips, as the row's width was planned; the account is no fifth chip.
	it("keeps the account out of the corner row", () => {
		const { container } = shell();
		const row = container.querySelector(".sc-corner-row");
		expect(row?.children).toHaveLength(4);
		expect(row?.querySelector(".sc-account-island")).toBeNull();
	});

	it("lets the project name take focus while the sheet is open, so it can be renamed", async () => {
		shell();
		// #107: the sheet held focus like a modal dialog: once anything in it had
		// focus (it takes it when it opens), a touch on the name was pulled straight
		// back into the sheet, so a phone could never rename the project.
		const sheet = screen.getByRole("dialog", { name: "Code and scenes" });
		act(() => sheet.focus());
		// Nor is anything outside the sheet hidden from a screen reader any more.
		const name = screen.getByRole("textbox", { name: "Project name" });
		expect(name.closest("[aria-hidden='true']")).toBeNull();

		act(() => name.focus());

		expect(document.activeElement).toBe(name);
		fireEvent.change(name, { target: { value: "Renamed on a phone" } });
		expect(useSnippetStore.getState().snippet.title).toBe("Renamed on a phone");
	});

	it("imports a file dropped on it and shows where it will land while it is dragged", async () => {
		imports.importStudioMediaFiles.mockResolvedValue(1);
		const { container } = shell();
		const still = new File(["png"], "still.png", { type: "image/png" });

		act(() => {
			window.dispatchEvent(dragEvent("dragenter"));
		});
		expect(container.querySelector(".sc-drop-veil[data-active]")).not.toBeNull();

		const drop = dragEvent("drop", [still]);
		await act(async () => {
			window.dispatchEvent(drop);
		});

		expect(drop.defaultPrevented).toBe(true);
		expect(imports.importStudioMediaFiles).toHaveBeenCalledWith([still]);
		expect(container.querySelector(".sc-drop-veil[data-active]")).toBeNull();
	});

	it("brings the code back once a layer is selected, and names the section after what it edits", () => {
		// #109: a layer picked on the stage covered the code editor in the sheet
		// with its inspector, nothing brought the code back, and the label above
		// the inspector still said "Code".
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) throw new Error("The template catalog must contain a project");
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
		const sceneId = useStudioCompositionStore.getState().selectedSceneId;
		if (!sceneId) throw new Error("The composition must have a selected scene");
		act(() => {
			const composition = useStudioCompositionStore.getState();
			composition.transact((draft) => addTextLayer(draft, sceneId, { id: "title", text: "Title" }));
			composition.selectBlock(sceneId, "title");
		});
		shell();
		const sheet = screen.getByRole("dialog", { name: "Code and scenes" });
		const editorSection = () => sheet.querySelector<HTMLElement>("[data-editor-section]");

		expect(editorSection()?.querySelector(".sc-eyebrow")?.textContent).toBe("Text");

		fireEvent.click(within(sheet).getByRole("button", { name: "Code" }));

		expect(useStudioCompositionStore.getState().selectedBlockId).toBeNull();
		expect(editorSection()?.querySelector(".sc-eyebrow")?.textContent).toBe("Code");
	});
});

describe("the stage while an island panel is open on the phone", () => {
	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
			}),
		});
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => cleanup());

	const handle = () => screen.getByRole("slider", { name: "Sheet height" });
	const stopText = () => handle().getAttribute("aria-valuetext");

	// A panel never resizes the stage: it asked the slot for 460px more than the screen
	// had left and the card refit to a box of nothing (ticket #169). The sheet gives the
	// room instead, by going down to the peek while a panel is open (DECISIONS D4).
	// jsdom has no layout, so the slot's own style and the sheet's stop are held here
	// and the card's box in the e2e journey.
	it("lowers the sheet to the peek while a panel is open, and puts it back where it was", () => {
		const { container } = shell();
		const slot = container.querySelector<HTMLElement>(".sc-stage-slot");
		const cta = container.querySelector<HTMLElement>(".si-cta");
		if (!slot || !cta) throw new Error("no stage slot or export control");
		const peekRoom = slot.style.paddingBottom;

		for (const [key, stop] of [
			["Enter", "Half open"],
			["Enter", "Open"],
			["Enter", "Collapsed"],
		] as const) {
			fireEvent.keyDown(handle(), { key });
			expect(stopText()).toBe(stop);

			fireEvent.click(cta);
			expect(screen.getByRole("button", { name: "Close settings" })).toBeTruthy();
			expect(stopText()).toBe("Collapsed");
			expect(slot.style.paddingBottom).toBe(peekRoom);

			fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
			expect(stopText()).toBe(stop);
		}
	});

	it("leaves the sheet where the user put it when they moved it during the panel", () => {
		const { container } = shell();
		const cta = container.querySelector<HTMLElement>(".si-cta");
		if (!cta) throw new Error("no export control");
		fireEvent.keyDown(handle(), { key: "Enter" });
		fireEvent.click(cta);
		expect(stopText()).toBe("Collapsed");

		fireEvent.keyDown(handle(), { key: "End" });
		fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
		expect(stopText()).toBe("Open");
	});

	it("keeps a stop the user chose during the panel when they switch to another tab", () => {
		const { container } = shell();
		const cta = container.querySelector<HTMLElement>(".si-cta");
		if (!cta) throw new Error("no export control");
		fireEvent.keyDown(handle(), { key: "Enter" });
		fireEvent.click(cta);
		expect(stopText()).toBe("Collapsed");

		fireEvent.keyDown(handle(), { key: "ArrowUp" });
		expect(stopText()).toBe("Half open");
		fireEvent.click(screen.getByRole("button", { name: "Look settings" }));
		expect(stopText()).toBe("Half open");

		fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
		expect(stopText()).toBe("Half open");
	});

	it("remembers the real previous stop each time the panel opens again", async () => {
		const { container } = shell();
		const cta = container.querySelector<HTMLElement>(".si-cta");
		if (!cta) throw new Error("no export control");
		fireEvent.keyDown(handle(), { key: "Enter" });
		expect(stopText()).toBe("Half open");

		await act(async () => {
			fireEvent.click(cta);
		});
		expect(stopText()).toBe("Collapsed");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
		});
		expect(stopText()).toBe("Half open");

		await act(async () => {
			fireEvent.click(cta);
		});
		expect(stopText()).toBe("Collapsed");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
		});
		expect(stopText()).toBe("Half open");
	});
});

describe("the phone sheet's handle", () => {
	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
			}),
		});
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => cleanup());

	const handle = () => screen.getByRole("slider", { name: "Sheet height" });
	const press = (key: string) => fireEvent.keyDown(handle(), { key });

	it("is a vertical slider a keyboard and a screen reader can reach, and says where the sheet is", () => {
		shell();
		expect(handle().getAttribute("aria-hidden")).toBeNull();
		expect(handle().tabIndex).toBe(0);
		expect(handle().getAttribute("aria-orientation")).toBe("vertical");
		expect(handle().getAttribute("aria-valuemin")).toBe("0");
		expect(handle().getAttribute("aria-valuemax")).toBe("2");
		expect(handle().getAttribute("aria-valuenow")).toBe("0");
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
	});

	it("steps through the stops on Enter and Space, and comes back to the peek from the top", () => {
		shell();
		press("Enter");
		expect(handle().getAttribute("aria-valuetext")).toBe("Half open");
		press(" ");
		expect(handle().getAttribute("aria-valuetext")).toBe("Open");
		expect(handle().getAttribute("aria-valuenow")).toBe("2");
		press("Enter");
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
	});

	it("raises and lowers one stop on the arrows, and jumps to the ends on Home and End", () => {
		shell();
		press("ArrowUp");
		expect(handle().getAttribute("aria-valuetext")).toBe("Half open");
		press("ArrowDown");
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
		press("ArrowDown");
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
		press("End");
		expect(handle().getAttribute("aria-valuetext")).toBe("Open");
		press("ArrowUp");
		expect(handle().getAttribute("aria-valuetext")).toBe("Open");
		press("Home");
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
	});

	it("leaves a shortcut alone, and any other key", () => {
		shell();
		fireEvent.keyDown(handle(), { key: "Enter", metaKey: true });
		fireEvent.keyDown(handle(), { key: "a" });
		expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
	});

	it("keeps the content out of the tab order and the tree until the sheet is raised", () => {
		shell();
		const content = () => document.getElementById(handle().getAttribute("aria-controls") ?? "");
		expect(content()?.hasAttribute("inert")).toBe(true);
		press("Enter");
		expect(content()?.hasAttribute("inert")).toBe(false);
	});
});

describe("the instrument on the sheet's edge", () => {
	afterEach(() => cleanup());

	it("moves in the same task as the drawer writes the sheet's transform, with its transition", async () => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: (query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
			}),
		});
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
		const { container } = shell();
		const dock = container.querySelector<HTMLElement>(".sc-dock-slot");
		const sheet = screen.getByRole("dialog", { name: "Code and scenes" });
		if (!dock) throw new Error("no dock");
		// At rest the instrument is on the peek, 12px above the sheet's edge.
		expect(dock.style.transform).toBe("translate3d(0, -68px, 0)");

		// jsdom has no layout: the sheet is as tall as its window.
		Object.defineProperty(sheet, "offsetHeight", { configurable: true, value: 768 });
		await act(async () => {
			sheet.style.transition = "none";
			sheet.style.transform = "translate3d(0, 500px, 0)";
			await Promise.resolve();
		});
		// 268px of sheet shows: the instrument rides 12px above it.
		expect(dock.style.transform).toBe("translate3d(0, -280px, 0)");
		expect(dock.style.transition).toBe("none");

		await act(async () => {
			sheet.style.transition = "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
			sheet.style.transform = "translate3d(0, 58px, 0)";
			await Promise.resolve();
		});
		// Let go over the full stop: the instrument takes the sheet's own curve down to the bottom.
		expect(dock.style.transform).toBe("translate3d(0, -12px, 0)");
		expect(dock.style.transition).toContain("cubic-bezier(0.32, 0.72, 0, 1)");
	});
});
