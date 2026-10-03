import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { Asset } from "@/domain/entities/asset";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioProjectDocument,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { studioMediaRegistry } from "@/presentation/studio-media-runtime";
import {
	openStudioProjectDocument,
	studioProjectFileJson,
} from "@/presentation/utils/studio-project-replacement";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #66: the studio's project file is the V2 document. It lists the media by
 * metadata (never bytes), it reopens with every layer, and a browser that does
 * not hold the bytes opens it anyway, each asset in its "Media unavailable"
 * state.
 */

const library = vi.hoisted(() => ({
	bytes: new Map<string, Blob>(),
	loadAsset: vi.fn(),
	loadProject: vi.fn(),
	saveProject: vi.fn(),
	saveAsset: vi.fn(),
	moveProject: vi.fn(),
	loadCurrent: vi.fn(),
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

const SINGLE_FRAME = JSON.stringify({
	title: "Single frame",
	code: "const only = 1;",
	language: "typescript",
	themeName: "midnight",
});

const TWO_STEPS = JSON.stringify({
	title: "Layers",
	code: "const b = 2;",
	language: "typescript",
	themeName: "nord",
	background: "mesh:ocean",
	steps: [
		{ code: "const a = 1;", duration: 1200 },
		{ code: "const b = 2;", duration: 1500, caption: "Second" },
	],
});

const IMAGE = Asset.create({
	id: "image-asset",
	kind: "image",
	fileName: "still.png",
	mimeType: "image/png",
	byteSize: 4,
	checksum: "a".repeat(64),
	width: 640,
	height: 360,
});

const AUDIO = Asset.create({
	id: "audio-asset",
	kind: "audio",
	fileName: "cue.wav",
	mimeType: "audio/wav",
	byteSize: 6,
	checksum: "b".repeat(64),
	durationMs: 2000,
});

function authorLayers(): void {
	openStudioProjectDocument(TWO_STEPS);
	synchronizeStudioCompositionStore();
	const composition = useStudioCompositionStore.getState();
	const [first, second] = composition.value.project.scenes;
	if (!first || !second) {
		throw new Error("expected two scenes");
	}
	composition.transact((project) => {
		let next = addTextLayer(project, second.id, { id: "text-layer", text: "Hello" });
		next = addMediaAsset(next, first.id, IMAGE, { blockId: "image-layer" });
		return addMediaAsset(next, first.id, AUDIO, { cueId: "audio-cue", startMs: 0 });
	});
}

function idsOf(document: ProjectDocumentV2) {
	return {
		scenes: document.project.scenes.map((scene) => scene.id),
		blocks: document.project.scenes.flatMap((scene) => scene.blocks.map((block) => block.id)),
	};
}

beforeEach(() => {
	library.bytes.clear();
	library.loadAsset.mockReset().mockImplementation(async ({ assetId }: { assetId: string }) => {
		const blob = library.bytes.get(assetId);
		return blob ? { assetId, mimeType: blob.type, byteSize: blob.size, opaqueHandle: blob } : null;
	});
	studioMediaRegistry.revokeAll();
	openStudioProjectDocument(SINGLE_FRAME);
});

describe("the V2 project file", () => {
	it("exports the V2 document with every layer, the media by metadata and no bytes", () => {
		authorLayers();

		const json = studioProjectFileJson();
		const file = JSON.parse(json) as ProjectDocumentV2;

		expect(file.schemaVersion).toBe(2);
		expect(file.project.assets.map((asset) => asset.id).sort()).toEqual([
			"audio-asset",
			"image-asset",
		]);
		expect(file.project.audioCues.map((cue) => cue.id)).toEqual(["audio-cue"]);
		const kinds = file.project.scenes.flatMap((scene) => scene.blocks.map((block) => block.kind));
		expect(kinds).toEqual(expect.arrayContaining(["code", "text", "image"]));
		expect(json).not.toMatch(/data:|base64/);
	});

	it("reopens to the identical document after the studio was cleared", () => {
		authorLayers();
		const exported = studioProjectFileJson();

		openStudioProjectDocument(SINGLE_FRAME);
		expect(readStudioProjectDocument().project.assets).toHaveLength(0);

		openStudioProjectDocument(exported);

		expect(readStudioProjectDocument()).toEqual(JSON.parse(exported));
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).toEqual(
			idsOf(JSON.parse(exported)).scenes,
		);
	});

	it("restores the media sources this browser still holds, and opens the rest unavailable", async () => {
		authorLayers();
		const exported = studioProjectFileJson();
		studioMediaRegistry.revokeAll();
		library.bytes.set("image-asset", new Blob(["png!"], { type: "image/png" }));

		openStudioProjectDocument(SINGLE_FRAME);
		expect(() => openStudioProjectDocument(exported)).not.toThrow();
		await vi.waitFor(() => expect(studioMediaRegistry.resolve("image-asset")).not.toBeNull());

		// The audio bytes are not on this device: the cue stays in the project,
		// unresolved, which is what draws "Media unavailable".
		expect(studioMediaRegistry.resolve("audio-asset")).toBeNull();
		expect(readStudioProjectDocument().project.audioCues).toHaveLength(1);
	});

	it("opens docs/demo.project.json with the same scene and step ids every time", () => {
		const raw = readFileSync(resolve(__dirname, "../../docs/demo.project.json"), "utf8");

		openStudioProjectDocument(raw);
		const first = {
			steps: useSnippetStore.getState().snippet.steps.map((step) => step.id),
			...idsOf(readStudioProjectDocument()),
		};
		openStudioProjectDocument(SINGLE_FRAME);
		openStudioProjectDocument(raw);
		const second = {
			steps: useSnippetStore.getState().snippet.steps.map((step) => step.id),
			...idsOf(readStudioProjectDocument()),
		};

		expect(first.steps.length).toBeGreaterThan(1);
		expect(second).toEqual(first);
		expect(first.steps).toEqual(first.scenes);
	});

	it("opens a V2 file into the studio's own project, never under the file's id", () => {
		authorLayers();
		const studioId = readStudioProjectDocument().project.id;
		const foreign = JSON.parse(studioProjectFileJson()) as ProjectDocumentV2;
		const renamed = { ...foreign, project: { ...foreign.project, id: "someone-elses-project" } };

		openStudioProjectDocument(JSON.stringify(renamed));

		expect(readStudioProjectDocument().project.id).toBe(studioId);
	});
});
