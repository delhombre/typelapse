import { RELEASE_CARD_MS, releaseProject } from "@/application/import/release-project";
import { addTextLayer } from "@/application/project/multimedia-authoring";
import { DiffImportMenu } from "@/presentation/components/layout/diff-import-menu";
import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { UrlImportMenu } from "@/presentation/components/layout/url-import-menu";
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
	vi.unstubAllGlobals();
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
		fireEvent.change(
			screen.getByRole("textbox", { name: "Git diff or GitHub pull request link" }),
			{
				target: { value: text },
			},
		);
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

describe("a paste carried in from the landing hero", () => {
	const PASTED = "const answer = 42;\nconsole.log(answer);";

	function arriveWith(source: string): void {
		act(() => {
			history.replaceState(null, "", `/app${encodeImportIntent({ source })}`);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});
	}

	it("lands with the pasted code captured as scene one, so Play is live", async () => {
		render(<ImportIntentBoot />);

		arriveWith(PASTED);

		await waitFor(() => expect(useSnippetStore.getState().snippet.steps.length).toBe(1));
		const { snippet, currentStepIndex } = useSnippetStore.getState();
		expect(snippet.code).toBe(PASTED);
		expect(snippet.steps[0]?.code).toBe(PASTED);
		expect(currentStepIndex).toBe(0);
		// The composition carries the same scene, and no undo walks back to an empty studio.
		expect(useStudioCompositionStore.getState().value.project.scenes).toHaveLength(1);
		expect(studioHistory.canUndo()).toBe(false);
	});

	it("does not add a scene on top of the ones a diff already made", async () => {
		render(<ImportIntentBoot />);

		arriveWith(VALID_DIFF);

		await waitFor(() => expect(useSnippetStore.getState().snippet.steps.length).toBe(2));
	});

	it("leaves a paste made inside the studio exactly as it was: code, no scene yet", async () => {
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(PASTED);
		});

		const { snippet } = useSnippetStore.getState();
		expect(snippet.code).toBe(PASTED);
		expect(snippet.steps).toHaveLength(0);
	});
});

describe("a release link", () => {
	const API = "https://api.github.com/repos/acme/app";
	const RELEASE_URL = "https://github.com/acme/app/releases/tag/v1.2.0";
	const SECOND_DIFF = VALID_DIFF.replace("`Hello, ${name}!`", "`Hi, ${name}!`").replace(
		'"Hello " + name',
		"`Hello, ${name}!`",
	);

	function stubGitHub(): string[] {
		const calls: string[] = [];
		const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
		const routes: Record<string, () => Response> = {
			[`${API}/releases/tags/v1.2.0`]: () =>
				json({ name: "Friendlier greetings", tag_name: "v1.2.0", body: "Every name is welcome." }),
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: () =>
				json({
					total_commits: 2,
					commits: [
						{ sha: "aaa1111", commit: { message: "Use a template" }, parents: [{}] },
						{ sha: "bbb2222", commit: { message: "Say hi" }, parents: [{}] },
					],
				}),
			[`${API}/commits/aaa1111`]: () => new Response(VALID_DIFF),
			[`${API}/commits/bbb2222`]: () => new Response(SECOND_DIFF),
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				calls.push(url);
				return routes[url]?.() ?? json({ message: "Not Found" }, 404);
			}),
		);
		return calls;
	}

	it("asks once over existing work, then lands the chaptered project behind its title card", async () => {
		const calls = stubGitHub();
		authorTextLayer();
		const stop = studioHistory.start();
		render(<UrlImportMenu />);

		fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
		fireEvent.change(screen.getByLabelText("Gist or GitHub link"), {
			target: { value: RELEASE_URL },
		});
		fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

		expect(screen.getByText("Replace what you have with this release?")).toBeTruthy();
		// Nothing is fetched before the answer.
		expect(calls).toEqual([]);
		fireEvent.click(screen.getByRole("button", { name: "Import the release" }));

		await waitFor(() =>
			expect(useSnippetStore.getState().snippet.title).toBe("Friendlier greetings"),
		);
		const chapters = [
			{ title: "Use a template", diffText: VALID_DIFF },
			{ title: "Say hi", diffText: SECOND_DIFF },
		];
		const expected = releaseProject({ title: "Friendlier greetings" }, chapters).steps;
		const steps = useSnippetStore.getState().snippet.steps;
		expect(steps.map((step) => [step.code, step.duration, step.annotation])).toEqual(
			expected.map((step) => [step.code, step.duration, step.caption]),
		);
		expect(steps[0]?.duration).toBe(RELEASE_CARD_MS);

		const scenes = useStudioCompositionStore.getState().toDocument().project.scenes;
		expect(
			scenes[0]?.blocks.map((block) => (block.kind === "text" ? block.text : block.kind)),
		).toEqual(["Friendlier greetings", "Every name is welcome."]);
		// The old project's layer went with it; the card's two are the only text.
		expect(textLayerCount()).toBe(2);
		expect(studioHistory.canUndo()).toBe(false);
		expect(screen.queryByText(/Replace what you have/)).toBeNull();
		stop();
	});

	it("says a missing release in one sentence and keeps the project", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 404 })),
		);
		authorTextLayer();
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(RELEASE_URL);
		});

		expect(result.current.error).toBe("Release not found (or the repository is private)");
		expect(textLayerCount()).toBe(1);
	});
});
