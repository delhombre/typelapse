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
		// The open drawer marks the test container aria-hidden (it is the portal's
		// sibling here); the role query still finds the controls by name.
		const undo = screen.getByRole("button", { name: "Undo", hidden: true }) as HTMLButtonElement;
		const redo = screen.getByRole("button", { name: "Redo", hidden: true }) as HTMLButtonElement;

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
