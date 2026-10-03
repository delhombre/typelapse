import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { StudioCompositionBridge } from "@/presentation/components/layout/studio-composition-bridge";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const library = vi.hoisted(() => ({
	loadCurrent: vi.fn(),
	loadAsset: vi.fn(),
	saveProject: vi.fn(),
	saveAsset: vi.fn(),
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
		library.loadCurrent.mockReset();
		library.loadAsset.mockReset();
		library.saveProject.mockReset().mockResolvedValue(undefined);
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
		library.loadCurrent.mockReturnValue(pending.promise);
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

	it("keeps the stored project when one asset's bytes can no longer be read", async () => {
		library.loadCurrent.mockResolvedValue(storedProjectWithImage());
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
});
