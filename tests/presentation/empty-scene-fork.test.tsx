import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { StudioSourceHub } from "@/presentation/components/layout/studio-source-hub";
import { TemplateGallery } from "@/presentation/components/layout/template-gallery";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { useShowcaseRequestStore } from "@/presentation/stores/showcase-request.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { synchronizeStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInertWindowScroll } from "../support/jsdom-gaps";

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

vi.mock("@/presentation/components/preview/looping-frames", () => ({
	LoopingFrames: () => <div />,
}));

/**
 * #250: a fresh studio has sample code and no scene. The scene list used to say
 * one bare sentence there; it now offers a fork, on both surfaces that list
 * scenes: the phone sheet (`StepBuilder`) and the desktop panel (`SceneInspector`).
 */

const CODE = "const answer = 42;";

function load(steps: { code: string; duration: number }[]) {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "fork",
			code: CODE,
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps,
		}),
	);
	synchronizeStudioCompositionStore();
}

beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
	useShowcaseRequestStore.setState({ requested: false });
	useDiffImportStore.setState({ pending: null });
});

afterEach(cleanup);

const SURFACES = [
	["the phone sheet", StepBuilder],
	["the desktop panel", SceneInspector],
] as const;

useInertWindowScroll();

describe.each(SURFACES)("the empty scene list on %s", (_name, Surface) => {
	it("offers a primary Capture and two quiet ways in, in one named group", () => {
		load([]);
		render(<Surface />);

		const fork = screen.getByRole("group", { name: /first scene/i });
		const names = within(fork)
			.getAllByRole("button")
			.map((button) => button.textContent?.trim());
		expect(names).toEqual(["Capture this code", "Start from an example", "Import a pull request"]);
		// Only the primary wears the fill (DECISIONS D2).
		const [primary, ...quiet] = within(fork).getAllByRole("button");
		expect(primary?.getAttribute("data-kind")).toBe("primary");
		for (const button of quiet) {
			expect(button.getAttribute("data-kind")).toBe("secondary");
		}
		expect(fork.textContent).not.toMatch(/[–—]/);
	});

	it("has one Capture control while the fork is shown: the head's quiet one steps aside", () => {
		load([]);
		render(<Surface />);

		expect(screen.getByRole("button", { name: "Capture this code" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
		// The other ways to add a scene stay where they were.
		expect(screen.getByRole("button", { name: "Blank" })).toBeTruthy();
	});

	it("gives the head's Capture back once the fork is gone", () => {
		load([{ code: CODE, duration: 2_000 }]);
		render(<Surface />);

		expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
	});

	it("gives the head's Capture back while the editor is empty, disabled, with its reason", () => {
		load([]);
		render(<Surface />);

		act(() => useSnippetStore.getState().setCode(""));

		const capture = screen.getByRole("button", { name: "Capture" });
		expect((capture as HTMLButtonElement).disabled).toBe(true);
	});

	it("captures the code as the first scene, and the fork goes away with it", () => {
		load([]);
		render(<Surface />);

		fireEvent.click(screen.getByRole("button", { name: "Capture this code" }));

		expect(useSnippetStore.getState().snippet.steps).toHaveLength(1);
		expect(screen.queryByRole("group", { name: /first scene/i })).toBeNull();
		expect(screen.queryByRole("button", { name: "Capture this code" })).toBeNull();
	});

	it("keeps focus in the list when the button it was on is gone", () => {
		load([]);
		render(<Surface />);
		const primary = screen.getByRole("button", { name: "Capture this code" });
		primary.focus();

		fireEvent.click(primary);

		expect(document.activeElement).not.toBe(document.body);
		expect(document.activeElement?.isConnected).toBe(true);
	});

	it("is not there once the project has a scene", () => {
		load([{ code: CODE, duration: 2_000 }]);
		render(<Surface />);

		expect(screen.queryByRole("group", { name: /first scene/i })).toBeNull();
		expect(screen.queryByRole("button", { name: "Start from an example" })).toBeNull();
	});

	it("is not there while the editor is empty: there is nothing to capture", () => {
		load([]);
		render(<Surface />);

		act(() => useSnippetStore.getState().setCode(""));

		expect(screen.queryByRole("group", { name: /first scene/i })).toBeNull();
	});

	it("comes back when the last scene is deleted", () => {
		load([{ code: CODE, duration: 2_000 }]);
		render(<Surface />);
		expect(screen.queryByRole("group", { name: /first scene/i })).toBeNull();

		act(() => {
			const only = useSnippetStore.getState().snippet.steps[0];
			if (only) useSnippetStore.getState().removeStep(only.id);
		});

		expect(screen.getByRole("group", { name: /first scene/i })).toBeTruthy();
	});

	it("opens the Showcase for real when Start from an example is pressed", async () => {
		load([]);
		render(
			<>
				<Surface />
				<TemplateGallery />
			</>,
		);
		expect(screen.queryByRole("dialog", { name: "Showcase" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Start from an example" }));

		expect(await screen.findByRole("dialog", { name: "Showcase" })).toBeTruthy();
		// One-shot: the request is spent, so closing it does not reopen it.
		expect(useShowcaseRequestStore.getState().requested).toBe(false);
	});

	it("opens the pull request importer for real when Import a pull request is pressed", async () => {
		load([]);
		render(
			<>
				<Surface />
				<StudioSourceHub />
			</>,
		);
		expect(screen.queryByRole("dialog", { name: "Import a git diff" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Import a pull request" }));

		expect(await screen.findByRole("dialog", { name: "Import a git diff" })).toBeTruthy();
		expect(useDiffImportStore.getState().pending).toBeNull();
	});

	it("returns focus to the row that opened the Showcase when it closes", async () => {
		load([]);
		render(
			<>
				<Surface />
				<TemplateGallery />
			</>,
		);
		const row = screen.getByRole("button", { name: "Start from an example" });
		fireEvent.click(row);
		const dialog = await screen.findByRole("dialog", { name: "Showcase" });

		fireEvent.keyDown(dialog, { key: "Escape" });

		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	it("returns focus to the row that opened the pull request importer when it closes", async () => {
		load([]);
		render(
			<>
				<Surface />
				<StudioSourceHub />
			</>,
		);
		const row = screen.getByRole("button", { name: "Import a pull request" });
		fireEvent.click(row);
		await screen.findByRole("dialog", { name: "Import a git diff" });

		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() => expect(document.activeElement).toBe(row));
	});

	it("opened from the header, the Showcase still returns focus to its own trigger", async () => {
		load([{ code: CODE, duration: 2_000 }]);
		render(<TemplateGallery />);
		const trigger = screen.getByRole("button", { name: "Showcase" });
		fireEvent.click(trigger);
		const dialog = await screen.findByRole("dialog", { name: "Showcase" });

		fireEvent.keyDown(dialog, { key: "Escape" });

		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("does not reach for a fork row that is gone: the trigger takes focus", async () => {
		load([]);
		render(
			<>
				<Surface />
				<TemplateGallery />
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Start from an example" }));
		const dialog = await screen.findByRole("dialog", { name: "Showcase" });
		// A scene appears behind the dialog (an import finished): the fork unmounts.
		act(() => {
			useSnippetStore.getState().captureStep();
		});

		fireEvent.keyDown(dialog, { key: "Escape" });

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole("button", { name: "Showcase" })),
		);
	});

	it("does not wipe a paste left in the importer when it is asked for again", async () => {
		load([]);
		render(
			<>
				<Surface />
				<StudioSourceHub />
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Import a pull request" }));
		const field = await screen.findByRole("textbox", {
			name: "Git diff or GitHub pull request link",
		});
		fireEvent.change(field, { target: { value: "https://github.com/a/b/pull/1" } });
		fireEvent.keyDown(document, { key: "Escape" });

		fireEvent.click(screen.getByRole("button", { name: "Import a pull request" }));

		const again = await screen.findByRole("textbox", {
			name: "Git diff or GitHub pull request link",
		});
		expect((again as HTMLTextAreaElement).value).toBe("https://github.com/a/b/pull/1");
	});

	it("reads as a whole to a screen reader: the group is named, the buttons say where they go", () => {
		load([]);
		render(<Surface />);

		const example = screen.getByRole("button", { name: "Start from an example" });
		const pull = screen.getByRole("button", { name: "Import a pull request" });
		expect(example.getAttribute("aria-haspopup")).toBe("dialog");
		expect(pull.getAttribute("aria-haspopup")).toBe("dialog");
	});
});
