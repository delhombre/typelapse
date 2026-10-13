// @vitest-environment jsdom
import { MobileShell } from "@/presentation/components/layout/mobile-shell";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useLibraryRequestStore } from "@/presentation/stores/library-request.store";
import { useShowcaseRequestStore } from "@/presentation/stores/showcase-request.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** A phone whose primary pointer is `coarse` or `fine`, as `(pointer: coarse)` answers it. */
function pointer(kind: "coarse" | "fine") {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: (query: string) => ({
			matches: query === "(pointer: coarse)" && kind === "coarse",
			media: query,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
		}),
	});
}

const shell = () =>
	render(
		<MemoryRouter>
			<StudioTooltipProvider>
				<MobileShell editor={<div />} stepBuilder={<div />} preview={<div />} sceneCount={1} />
			</StudioTooltipProvider>
		</MemoryRouter>,
	);

const row = () => document.querySelector(".sc-corner-row") as HTMLElement;

beforeEach(() => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	useSnippetStore.getState().setTitle("Release notes");
	useShowcaseRequestStore.setState({ requested: false, opener: null });
	useLibraryRequestStore.setState({ requested: false, opener: null });
});

afterEach(cleanup);

describe("the phone's corner row under a finger", () => {
	beforeEach(() => pointer("coarse"));

	it("holds the project as one button, Undo, Redo, Add source and More, and nothing else", () => {
		shell();
		const names = within(row())
			.getAllByRole("button")
			.map((button) => button.getAttribute("aria-label"));
		expect(names).toEqual([
			"Open project menu, Release notes",
			"Undo",
			"Redo",
			"Add source",
			"More actions",
		]);
		expect(within(row()).queryByRole("link")).toBeNull();
		expect(within(row()).queryByRole("textbox")).toBeNull();
		expect(row().dataset.pointer).toBe("coarse");
	});

	it("moves Showcase and Library into More, in that order, and the way home with them", () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));
		const menu = document.querySelector(".sc-utility-overflow-menu") as HTMLElement;
		const rows = [...menu.querySelectorAll(":scope > :is(button, a)")].map((el) =>
			el.textContent?.trim(),
		);
		expect(rows[0]).toBe("Showcase");
		expect(rows[1]).toBe("Library");
		expect(rows.at(-1)).toBe("Back to home");
		// The way out of the studio is set apart from the actions above it.
		expect(menu.querySelector(":scope > hr + a")).not.toBeNull();
	});

	it("asks the Showcase to open and closes the menu", async () => {
		shell();
		const more = screen.getByRole("button", { name: "More actions" });
		fireEvent.click(more);
		fireEvent.click(screen.getByRole("button", { name: "Showcase" }));
		// The gallery is mounted without a button and takes the ask in the same breath.
		expect(screen.getByRole("dialog", { name: "Showcase" })).toBeTruthy();
		// The menu leaves with its exit animation.
		await waitFor(() => expect(document.querySelector(".sc-utility-overflow-menu")).toBeNull());
		expect(useShowcaseRequestStore.getState().requested).toBe(false);
	});

	it("asks the library to open the same way", async () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Library" }));
		});
		expect(await screen.findByRole("dialog", { name: "Capture library" })).toBeTruthy();
		expect(useLibraryRequestStore.getState().requested).toBe(false);
	});

	it("keeps the name's field out of the menu role, in a region beside it", () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: /^Open project menu/ }));
		const region = screen.getByRole("region", { name: "Project" });
		const menu = within(region).getByRole("menu", { name: "Local projects" });
		expect(within(region).getByRole("textbox", { name: "Project name" })).toBeTruthy();
		expect(within(menu).queryByRole("textbox")).toBeNull();
		expect(within(menu).getAllByRole("menuitem").length).toBeGreaterThan(0);
	});

	it("renames the project in its menu, where the chip is one button", () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: /^Open project menu/ }));
		fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
			target: { value: "Changelog" },
		});
		expect(useSnippetStore.getState().snippet.title).toBe("Changelog");
		expect(screen.getByRole("button", { name: "Open project menu, Changelog" })).toBeTruthy();
	});
});

describe("the phone's corner row under a cursor", () => {
	beforeEach(() => pointer("fine"));

	it("keeps every control where it was: the link, the field, Library and Showcase", () => {
		shell();
		expect(row().dataset.pointer).toBe("fine");
		expect(within(row()).getByRole("link", { name: "Typelapse home" })).toBeTruthy();
		expect(within(row()).getByRole("textbox", { name: "Project name" })).toBeTruthy();
		expect(within(row()).getByRole("button", { name: "Open project menu" })).toBeTruthy();
		for (const name of ["Add source", "Library", "Showcase"]) {
			expect(within(row()).getByRole("button", { name })).toBeTruthy();
		}
	});

	it("keeps More as it was: no resources, no way home", () => {
		shell();
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));
		const menu = document.querySelector(".sc-utility-overflow-menu") as HTMLElement;
		expect(within(menu).queryByRole("button", { name: "Showcase" })).toBeNull();
		expect(within(menu).queryByRole("button", { name: "Library" })).toBeNull();
		expect(within(menu).queryByRole("link")).toBeNull();
	});
});
