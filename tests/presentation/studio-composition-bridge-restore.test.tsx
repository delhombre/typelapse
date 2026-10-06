import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	type EncodedProjectHistory,
	createProjectHistory,
	encodeProjectHistory,
	recordProjectEdit,
} from "@/application/project/project-history";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { StudioCompositionBridge } from "@/presentation/components/layout/studio-composition-bridge";
import { createStudioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { createLocalProject } from "@/presentation/utils/local-project-storage";
import { whenStudioCompositionReady } from "@/presentation/utils/studio-composition-ready";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const library = vi.hoisted(() => ({
	loadProject: vi.fn(),
	moveProject: vi.fn(),
	loadAsset: vi.fn(),
	saveProject: vi.fn(),
	saveAsset: vi.fn(),
	deleteUnreferencedAssets: vi.fn(),
}));

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	const { BrowserObjectUrlSceneAssetSourceFactory } = await import(
		"@/infrastructure/assets/browser-local-media-importer"
	);
	let next = 0;
	return {
		studioLocalLibrary: library,
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: new BrowserObjectUrlSceneAssetSourceFactory({
			createObjectURL: () => `blob:test/${++next}`,
			revokeObjectURL: () => undefined,
		}),
	};
});

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

/** The stored image, plus a second one whose layer was deleted before the save. */
function storedProjectWithOrphan(): ProjectDocumentV2 {
	const blank = useStudioCompositionStore.getState().value;
	const sceneId = blank.project.scenes[0]?.id ?? "";
	const orphan = Asset.create({
		id: "orphan-image",
		kind: "image",
		fileName: "gone.png",
		mimeType: "image/png",
		byteSize: 4,
		checksum: "b".repeat(64),
		width: 640,
		height: 360,
	});
	const withOrphan = addMediaAsset(
		addMediaAsset(blank.project, sceneId, Asset.create({ ...storedImageProps }), {
			blockId: "stored-block",
		}),
		sceneId,
		orphan,
		{ blockId: "orphan-block" },
	).removeBlock(sceneId, "orphan-block");
	return serializeProjectDocument({ ...blank, project: withOrphan });
}

const storedImageProps = {
	id: "stored-image",
	kind: "image",
	fileName: "still.png",
	mimeType: "image/png",
	byteSize: 4,
	checksum: "a".repeat(64),
	width: 640,
	height: 360,
} as const;

function storedProjectWithImage(): ProjectDocumentV2 {
	const blank = useStudioCompositionStore.getState().value;
	const sceneId = blank.project.scenes[0]?.id;
	if (!sceneId) throw new Error("The studio composition must have a scene");
	const image = Asset.create({
		id: "stored-image",
		kind: "image",
		fileName: "still.png",
		mimeType: "image/png",
		byteSize: 4,
		checksum: "a".repeat(64),
		width: 640,
		height: 360,
	});
	return serializeProjectDocument({
		...blank,
		project: addMediaAsset(blank.project, sceneId, image, { blockId: "stored-block" }),
	});
}

describe("StudioCompositionBridge restore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(globalThis, "indexedDB", { value: {}, configurable: true });
		library.loadProject.mockReset();
		library.moveProject.mockReset().mockResolvedValue(null);
		library.loadAsset.mockReset();
		library.saveProject.mockReset().mockResolvedValue(undefined);
		library.deleteUnreferencedAssets.mockReset().mockResolvedValue([]);
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		Reflect.deleteProperty(globalThis, "indexedDB");
	});

	it("never saves the blank boot document before the stored project has been read", async () => {
		const stored = storedProjectWithImage();
		const pending = deferred<ProjectDocumentV2 | null>();
		library.loadProject.mockReturnValue(pending.promise);
		library.loadAsset.mockResolvedValue({
			assetId: "stored-image",
			mimeType: "image/png",
			byteSize: 4,
			opaqueHandle: new Blob(["png!"], { type: "image/png" }),
		});

		render(<StudioCompositionBridge />);
		// A composition change during boot used to schedule a save of the blank
		// document that could overwrite the stored project before it was read.
		act(() => {
			const state = useStudioCompositionStore.getState();
			const sceneId = state.value.project.scenes[0]?.id ?? "";
			state.transact((project) =>
				addTextLayer(project, sceneId, {
					id: "boot-text",
					text: "Boot",
					placement: { x: 0, y: 0, width: 1, height: 0.2 },
				}),
			);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(library.saveProject).not.toHaveBeenCalled();

		await act(async () => {
			pending.resolve(stored);
			await vi.advanceTimersByTimeAsync(1_000);
		});

		const restored = useStudioCompositionStore.getState().value.project;
		expect(restored.assets.map((asset) => asset.id)).toEqual(["stored-image"]);
		expect(library.saveProject).toHaveBeenCalled();
		for (const [document] of library.saveProject.mock.calls) {
			expect((document as ProjectDocumentV2).project.assets).toHaveLength(1);
		}
	});

	it("reads and writes the composition of the open local project, under its id", async () => {
		createLocalProject(
			{
				title: "Alpha",
				code: "const alpha = 1;",
				language: "typescript",
				themeName: "midnight",
				background: "mesh:solar",
				steps: [],
			},
			{ id: "alpha" },
		);
		library.loadProject.mockResolvedValue(null);

		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});

		expect(library.loadProject).toHaveBeenCalledWith("alpha");
		expect(library.moveProject).toHaveBeenCalledWith("studio-project", "alpha");
		expect(useStudioCompositionStore.getState().value.project.id).toBe("alpha");
		expect(library.saveProject).toHaveBeenCalled();
		for (const [document] of library.saveProject.mock.calls) {
			expect((document as ProjectDocumentV2).project.id).toBe("alpha");
		}
		window.localStorage.clear();
	});

	it("keeps the stored project when one asset's bytes can no longer be read", async () => {
		library.loadProject.mockResolvedValue(storedProjectWithImage());
		library.loadAsset.mockRejectedValue(new Error("Local media content no longer matches"));

		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});

		const restored = useStudioCompositionStore.getState().value.project;
		expect(restored.assets.map((asset) => asset.id)).toEqual(["stored-image"]);
		for (const [document] of library.saveProject.mock.calls) {
			expect((document as ProjectDocumentV2).project.assets).toHaveLength(1);
		}
	});

	it("restores without the assets no layer references, and sweeps the blobs nothing uses", async () => {
		library.loadProject.mockResolvedValue(storedProjectWithOrphan());
		library.loadAsset.mockResolvedValue({
			assetId: "stored-image",
			mimeType: "image/png",
			byteSize: 4,
			opaqueHandle: new Blob(["png!"], { type: "image/png" }),
		});

		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});

		const restored = useStudioCompositionStore.getState().value.project;
		expect(restored.assets.map((asset) => asset.id)).toEqual(["stored-image"]);
		// No object URL is made for bytes nothing shows.
		expect(library.loadAsset.mock.calls.map(([input]) => input.assetId)).not.toContain(
			"orphan-image",
		);
		expect(library.saveProject).toHaveBeenCalled();
		for (const [document] of library.saveProject.mock.calls) {
			expect((document as ProjectDocumentV2).project.assets.map((asset) => asset.id)).toEqual([
				"stored-image",
			]);
		}
		expect(library.deleteUnreferencedAssets).toHaveBeenCalledOnce();
		const [kept] = library.deleteUnreferencedAssets.mock.calls[0] ?? [];
		expect([...(kept as Iterable<string>)]).toEqual(["stored-image"]);
	});

	it("writes a pending save at once when the page is hidden", async () => {
		library.loadProject.mockResolvedValue(null);
		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		library.saveProject.mockClear();

		act(() => {
			const state = useStudioCompositionStore.getState();
			const sceneId = state.value.project.scenes[0]?.id ?? "";
			state.transact((project) =>
				addTextLayer(project, sceneId, {
					id: "late-text",
					text: "Late",
					placement: { x: 0, y: 0, width: 1, height: 0.2 },
				}),
			);
		});
		expect(library.saveProject).not.toHaveBeenCalled();
		act(() => {
			window.dispatchEvent(new Event("pagehide"));
		});

		expect(library.saveProject).toHaveBeenCalledOnce();
		const [saved] = library.saveProject.mock.calls[0] as [ProjectDocumentV2];
		expect(
			saved.project.scenes.some((scene) => scene.blocks.some((block) => block.id === "late-text")),
		).toBe(true);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(library.saveProject).toHaveBeenCalledOnce();
	});

	// An undo then a redo inside one debounce window ends on the state already stored.
	// The save that was waiting for the undone state used to fire anyway, so the
	// stored project lagged the studio by the last edit until the next change.
	it("never writes a state the studio has already left, when the edit is undone inside the window", async () => {
		library.loadProject.mockResolvedValue(null);
		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		const sceneId = useStudioCompositionStore.getState().value.project.scenes[0]?.id ?? "";
		const addText = (id: string) =>
			act(() => {
				useStudioCompositionStore.getState().transact((project) =>
					addTextLayer(project, sceneId, {
						id,
						text: id,
						placement: { x: 0, y: 0, width: 1, height: 0.2 },
					}),
				);
			});

		addText("one");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		library.saveProject.mockClear();

		// "two" is made, then gone again before the debounce fires.
		addText("two");
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => project.removeBlock(sceneId, "two"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});

		const written = library.saveProject.mock.calls.map(([document]) =>
			(document as ProjectDocumentV2).project.scenes.flatMap((scene) =>
				scene.blocks.map((block) => block.id),
			),
		);
		expect(written.filter((ids) => ids.includes("two"))).toEqual([]);
	});

	it("holds an import until the stored project has been put back", async () => {
		const pending = deferred<ProjectDocumentV2 | null>();
		library.loadProject.mockReturnValue(pending.promise);
		render(<StudioCompositionBridge />);
		let ready = false;
		void whenStudioCompositionReady().then(() => {
			ready = true;
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500);
		});
		expect(ready).toBe(false);

		await act(async () => {
			pending.resolve(null);
			await vi.advanceTimersByTimeAsync(10);
		});
		expect(ready).toBe(true);
	});

	it("boots the V1 draft on the scene ids the stored project has, so nothing needs re-keying", async () => {
		const stored = bootDraftOverStoredIds("studio-project");
		library.loadProject.mockResolvedValue(stored);

		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});

		const kept = ["kept-1", "kept-2"];
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).toEqual(kept);
		const restored = readStudioProjectDocument().project;
		expect(restored.scenes.map((scene) => scene.id)).toEqual(kept);
		expect(restored.scenes[1]?.blocks.map((block) => block.id)).toContain("kept-text");
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
	});

	it("undoes into the stored history after a reload with the same scene ids", async () => {
		createLocalProject(
			{
				title: "ids.ts",
				code: "const a = 1;",
				language: "typescript",
				themeName: "midnight",
				background: "mesh:solar",
				steps: [],
			},
			{ id: "alpha" },
		);
		const stored = bootDraftOverStoredIds("alpha");
		const earlier = { ...stored, project: { ...stored.project, title: "Before the reload" } };
		const saved = new Map<string, EncodedProjectHistory>();
		saved.set(
			"alpha",
			encodeProjectHistory(recordProjectEdit(createProjectHistory(earlier), stored, 0)),
		);
		library.loadProject.mockResolvedValue(stored);
		const history = createStudioHistory({
			storage: {
				load: async (projectId) => structuredClone(saved.get(projectId) ?? null),
				save: async () => undefined,
			},
			now: () => 60_000,
		});
		const stop = history.start();

		render(<StudioCompositionBridge />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		await history.ready();

		expect(history.undo()).toBe(true);
		const undone = readStudioProjectDocument().project;
		expect(undone.title).toBe("Before the reload");
		expect(undone.scenes.map((scene) => scene.id)).toEqual(["kept-1", "kept-2"]);
		stop();
		window.localStorage.clear();
	});
});

/**
 * Put a V1 draft in the snippet (it mints ids of its own) and return last
 * session's stored composition of the same code, under ids it kept, with a
 * text layer on the second scene.
 */
function bootDraftOverStoredIds(projectId: string): ProjectDocumentV2 {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "ids.ts",
			// The live code is the last step's, as a studio that captured it holds.
			code: "const a = 2;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [
				{ code: "const a = 1;", duration: 1000 },
				{ code: "const a = 2;", duration: 1000 },
			],
		}),
	);
	const booted = createStudioCompositionDocument({ ...readStudioCompositionSnapshot(), projectId });
	const lastSession = hydrateProjectDocument({
		...booted,
		project: {
			...booted.project,
			scenes: booted.project.scenes.map((scene, index) => ({ ...scene, id: `kept-${index + 1}` })),
		},
	});
	return serializeProjectDocument({
		...lastSession,
		project: addTextLayer(lastSession.project, "kept-2", {
			id: "kept-text",
			text: "Still here",
			placement: { x: 0, y: 0, width: 1, height: 0.2 },
		}),
	});
}
