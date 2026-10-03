// @vitest-environment jsdom
import { MobileShell } from "@/presentation/components/layout/mobile-shell";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

	it("keeps the appearance and sound toggles one tap away, in the More menu", () => {
		shell();
		expect(screen.queryByRole("button", { name: "Switch to dark mode", hidden: true })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "More actions", hidden: true }));

		expect(
			screen.getByRole("menuitem", { name: /dark mode|light mode/, hidden: true }),
		).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /interface feedback/, hidden: true })).toBeTruthy();
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
});
