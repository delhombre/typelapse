// @vitest-environment jsdom
import { MobileShell } from "@/presentation/components/layout/mobile-shell";
import { SceneCodeCard } from "@/presentation/components/layout/scene-code-card";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useEditorMounted } from "@/presentation/contexts/editor-presence";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Stands where the code editor does: it says whether the slot let it mount. */
function Probe() {
	return useEditorMounted() ? (
		<div data-testid="editor-mounted" />
	) : (
		<div data-testid="editor-idle" />
	);
}

function installBrowserStubs() {
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
}

describe("the shells say when the editor slot is shown", () => {
	const initialSnippet = useSnippetStore.getState().snippet;
	beforeEach(installBrowserStubs);
	afterEach(() => {
		cleanup();
		useSnippetStore.setState({ snippet: initialSnippet });
	});

	function card(folded: boolean) {
		return (
			<StudioTooltipProvider>
				<SceneCodeCard
					folded={folded}
					onFold={() => undefined}
					editor={<Probe />}
					sceneInspector={<div />}
				/>
			</StudioTooltipProvider>
		);
	}

	it("keeps the editor out of a code card that is folded away, and mounts it on unfold", () => {
		const view = render(card(true));
		expect(screen.queryByTestId("editor-mounted")).toBeNull();

		view.rerender(card(false));
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();

		// Folding again is a transform and an opacity: the editor stays.
		view.rerender(card(true));
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();
	});

	it("keeps the editor out of the phone sheet at its peek, and mounts it once the sheet rises", () => {
		useSnippetStore.getState().captureStep();
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
		render(
			<MemoryRouter>
				<StudioTooltipProvider>
					<MobileShell editor={<Probe />} stepBuilder={<div />} preview={<div />} sceneCount={1} />
				</StudioTooltipProvider>
			</MemoryRouter>,
		);
		const handle = screen.getByRole("slider", { name: "Sheet height" });
		expect(handle.getAttribute("aria-valuetext")).toBe("Collapsed");
		expect(screen.queryByTestId("editor-mounted")).toBeNull();

		fireEvent.keyDown(handle, { key: "ArrowUp" });
		expect(handle.getAttribute("aria-valuetext")).toBe("Half open");
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();

		fireEvent.keyDown(handle, { key: "Home" });
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();
	});

	it("starts the editor as soon as a finger takes the sheet's handle, before it moves", () => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
		render(
			<MemoryRouter>
				<StudioTooltipProvider>
					<MobileShell editor={<Probe />} stepBuilder={<div />} preview={<div />} sceneCount={1} />
				</StudioTooltipProvider>
			</MemoryRouter>,
		);
		const handle = screen.getByRole("slider", { name: "Sheet height" });
		expect(screen.queryByTestId("editor-mounted")).toBeNull();

		// The drawer captures the pointer on the press, which jsdom does not implement.
		handle.setPointerCapture = () => undefined;
		fireEvent.pointerDown(handle);
		expect(handle.getAttribute("aria-valuetext")).toBe("Collapsed");
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();
	});

	function emptyPhone() {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
		render(
			<MemoryRouter>
				<StudioTooltipProvider>
					<MobileShell editor={<Probe />} stepBuilder={<div />} preview={<div />} sceneCount={0} />
				</StudioTooltipProvider>
			</MemoryRouter>,
		);
		return screen.getByRole("slider", { name: "Sheet height" });
	}

	it("opens an empty project's sheet on the scenes stop, with no editor behind it", () => {
		const handle = emptyPhone();
		expect(handle.getAttribute("aria-valuetext")).toBe("Half open");
		expect(screen.queryByTestId("editor-mounted")).toBeNull();
	});

	it("mounts the editor of an empty project at the Edit stop, and not before", () => {
		const handle = emptyPhone();
		fireEvent.keyDown(handle, { key: "ArrowUp" });
		expect(handle.getAttribute("aria-valuetext")).toBe("Open");
		expect(screen.getByTestId("editor-mounted")).toBeTruthy();
	});

	it("opens a project with scenes on the peek, as before", () => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
		render(
			<MemoryRouter>
				<StudioTooltipProvider>
					<MobileShell editor={<Probe />} stepBuilder={<div />} preview={<div />} sceneCount={2} />
				</StudioTooltipProvider>
			</MemoryRouter>,
		);
		expect(
			screen.getByRole("slider", { name: "Sheet height" }).getAttribute("aria-valuetext"),
		).toBe("Collapsed");
	});
});
