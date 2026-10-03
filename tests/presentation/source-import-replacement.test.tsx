import { addTextLayer } from "@/application/project/multimedia-authoring";
import { DiffImportMenu } from "@/presentation/components/layout/diff-import-menu";
import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { setStudioCompositionRestored } from "@/presentation/utils/studio-composition-ready";
import { openStudioProjectDocument } from "@/presentation/utils/studio-project-replacement";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A pull request, a diff or a commit import behaves like opening a file: it
 * replaces the project and its undo history. It used to replace only the code,
 * so the old project's text layer was cloned into every scene of the import.
 */

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

const SINGLE_FRAME = JSON.stringify({
	title: "Single frame",
	code: "const only = 1;",
	language: "typescript",
	themeName: "midnight",
});

const VALID_DIFF = [
	"diff --git a/src/greet.ts b/src/greet.ts",
	"--- a/src/greet.ts",
	"+++ b/src/greet.ts",
	"@@ -1,3 +1,3 @@",
	" function greet(name) {",
	'-  return "Hello " + name;',
	"+  return `Hello, ${name}!`;",
	" }",
].join("\n");

function textLayerCount(): number {
	return useStudioCompositionStore
		.getState()
		.toDocument()
		.project.scenes.flatMap((scene) => scene.blocks)
		.filter((block) => block.kind === "text").length;
}

function authorTextLayer(): void {
	synchronizeStudioCompositionStore();
	const composition = useStudioCompositionStore.getState();
	const sceneId = composition.value.project.scenes[0]?.id;
	if (!sceneId) {
		throw new Error("expected a scene");
	}
	composition.transact((project) => addTextLayer(project, sceneId, { text: "Old project" }));
	expect(textLayerCount()).toBe(1);
}

beforeEach(() => {
	openStudioProjectDocument(SINGLE_FRAME);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	history.replaceState(null, "", "/");
});

describe("an import replaces the project", () => {
	it("leaves no layer of the previous project and no undo history", async () => {
		authorTextLayer();
		const { result } = renderHook(() => useSourceImport());

		let imported = false;
		await act(async () => {
			imported = await result.current.run(VALID_DIFF);
		});

		expect(imported).toBe(true);
		expect(useSnippetStore.getState().snippet.steps.length).toBe(2);
		expect(textLayerCount()).toBe(0);
	});

	it("keeps the project whole when the import is refused", async () => {
		authorTextLayer();
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(
				"--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a",
			);
		});

		expect(result.current.error).toBe(
			"This diff only changes the newline at the end of the file: there is nothing to animate.",
		);
		expect(textLayerCount()).toBe(1);
	});

	it("waits for the stored project to be on screen, so the restore cannot undo it", async () => {
		authorTextLayer();
		setStudioCompositionRestored(false);
		const { result } = renderHook(() => useSourceImport());

		let imported: Promise<boolean> = Promise.resolve(false);
		act(() => {
			imported = result.current.run(VALID_DIFF);
		});
		await Promise.resolve();
		expect(useSnippetStore.getState().snippet.steps.length).toBe(0);

		await act(async () => {
			setStudioCompositionRestored(true);
			await imported;
		});
		expect(useSnippetStore.getState().snippet.steps.length).toBe(2);
		expect(textLayerCount()).toBe(0);
	});

	it("starts the undo history over from the imported project", async () => {
		const stop = studioHistory.start();
		authorTextLayer();
		studioHistory.capture();
		expect(studioHistory.canUndo()).toBe(true);
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(VALID_DIFF);
		});
		await Promise.resolve();

		expect(studioHistory.canUndo()).toBe(false);
		stop();
	});
});

describe("the import confirm", () => {
	function openAndPaste(text: string): void {
		fireEvent.click(screen.getByRole("button", { name: "Import a git diff" }));
		fireEvent.change(screen.getByPlaceholderText(/paste a git diff/), {
			target: { value: text },
		});
	}

	it("asks once when the only work to lose is a layer, and names what is imported", async () => {
		authorTextLayer();
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
		render(<DiffImportMenu />);
		openAndPaste(VALID_DIFF);

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		expect(screen.getByText("Replace what you have with this diff?")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Import the diff" }));

		await waitFor(() => expect(useSnippetStore.getState().snippet.steps.length).toBe(2));
		expect(textLayerCount()).toBe(0);
		await waitFor(() => expect(screen.queryByText(/Replace what you have/)).toBeNull());
	});

	it("names a pull request as a pull request", () => {
		authorTextLayer();
		render(<DiffImportMenu />);
		openAndPaste("https://github.com/acme/app/pull/42");

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(screen.getByText("Replace what you have with this pull request?")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Import the pull request" })).toBeTruthy();
	});
});

describe("an import link on an open studio", () => {
	it("imports when the hash changes to #import= after the studio opened", async () => {
		render(<ImportIntentBoot />);
		expect(useSnippetStore.getState().snippet.steps.length).toBe(0);

		act(() => {
			history.replaceState(null, "", `/app${encodeImportIntent({ source: VALID_DIFF })}`);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});

		await waitFor(() => expect(useSnippetStore.getState().snippet.steps.length).toBe(2));
		expect(window.location.hash).toBe("");
	});

	it("asks first when the open project has work to lose", async () => {
		authorTextLayer();
		render(<ImportIntentBoot />);

		act(() => {
			history.replaceState(null, "", `/app${encodeImportIntent({ source: VALID_DIFF })}`);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});

		expect(await screen.findByText("Replace what you have with this diff?")).toBeTruthy();
		expect(useSnippetStore.getState().snippet.steps.length).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: "Import the diff" }));

		await waitFor(() => expect(useSnippetStore.getState().snippet.steps.length).toBe(2));
		expect(textLayerCount()).toBe(0);
	});

	it("keeps the project when the import is declined", async () => {
		authorTextLayer();
		render(<ImportIntentBoot />);

		act(() => {
			history.replaceState(null, "", `/app${encodeImportIntent({ source: VALID_DIFF })}`);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});

		fireEvent.click(await screen.findByRole("button", { name: "Keep my snippet" }));

		expect(screen.queryByText(/Replace what you have/)).toBeNull();
		expect(useSnippetStore.getState().snippet.steps.length).toBe(0);
		expect(textLayerCount()).toBe(1);
	});
});
