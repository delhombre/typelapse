import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { StudioSourceHub } from "@/presentation/components/layout/studio-source-hub";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted above the imports: the theme-mode store reads matchMedia the moment
// its module loads. Reduced motion keeps the menu from animating forever.
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

const runtime = vi.hoisted(() => ({
	importFile: vi.fn(),
	saveAsset: vi.fn(async () => undefined),
}));

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	return {
		studioMediaImporter: { importFile: runtime.importFile },
		studioLocalLibrary: { saveAsset: runtime.saveAsset },
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: { create: vi.fn() },
	};
});

const PHOTO = Asset.create({
	id: "image-1",
	kind: "image",
	fileName: "cover.jpg",
	mimeType: "image/jpeg",
	byteSize: 1_024,
	checksum: "a".repeat(64),
	width: 1_200,
	height: 800,
});

const MUSIC = Asset.create({
	id: "audio-1",
	kind: "audio",
	fileName: "pulse.wav",
	mimeType: "audio/wav",
	byteSize: 2_048,
	checksum: "c".repeat(64),
	durationMs: 8_000,
});

function chooseMedia(container: HTMLElement, file: File): void {
	// The hub holds two pickers; the media one is the one not limited to JSON.
	const input = container.querySelector<HTMLInputElement>(
		'input[type="file"]:not([accept=".json"])',
	);
	expect(input).not.toBeNull();
	fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe("StudioSourceHub media import", () => {
	beforeEach(() => {
		runtime.importFile.mockReset();
		runtime.saveAsset.mockClear();
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	});

	afterEach(() => cleanup());

	it("adds a photo by its metadata, keeps its bytes on this device and its preview URL out of the project", async () => {
		runtime.importFile.mockResolvedValue({
			asset: PHOTO,
			source: { assetId: PHOTO.id, src: "blob:cover" },
		});
		const file = new File([new Uint8Array(1_024)], "cover.jpg", { type: "image/jpeg" });
		const { container } = render(
			<MemoryRouter>
				<StudioSourceHub />
			</MemoryRouter>,
		);

		chooseMedia(container, file);

		await waitFor(() =>
			expect(useStudioCompositionStore.getState().value.project.assets).toHaveLength(1),
		);
		const composition = useStudioCompositionStore.getState();
		const block = composition.value.project.scenes
			.flatMap((scene) => scene.blocks)
			.find((candidate) => candidate.kind === "image");
		expect(block).toMatchObject({ kind: "image", assetId: "image-1" });
		expect(composition.selectedBlockId).toBe(block?.id);
		expect(runtime.saveAsset).toHaveBeenCalledWith({
			projectId: composition.value.project.id,
			assetId: "image-1",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			opaqueHandle: file,
		});
		expect(JSON.stringify(composition.toDocument())).not.toContain("blob:");
	});

	it("selects an imported audio cue so its inspector opens on the cue", async () => {
		runtime.importFile.mockResolvedValue({
			asset: MUSIC,
			source: { assetId: MUSIC.id, src: "blob:pulse" },
		});
		const { container } = render(
			<MemoryRouter>
				<StudioSourceHub />
			</MemoryRouter>,
		);

		chooseMedia(container, new File([new Uint8Array(2_048)], "pulse.wav", { type: "audio/wav" }));

		await waitFor(() =>
			expect(useStudioCompositionStore.getState().value.project.audioCues).toHaveLength(1),
		);
		const cue = useStudioCompositionStore.getState().value.project.audioCues[0];
		expect(cue?.assetId).toBe("audio-1");
		expect(useStudioCompositionSelectionStore.getState().selectedAudioCueId).toBe(cue?.id);
		expect(useStudioCompositionStore.getState().selectedBlockId).toBeNull();
	});
});

describe("StudioSourceHub keyboard exits", () => {
	afterEach(() => cleanup());

	function openHub() {
		const view = render(
			<MemoryRouter>
				<StudioSourceHub />
			</MemoryRouter>,
		);
		const trigger = view.getByRole("button", { name: "Add source" });
		fireEvent.click(trigger);
		return { view, trigger };
	}

	it("hands focus back to Add source when Escape closes the menu", () => {
		const { view, trigger } = openHub();
		view.getByRole("menuitem", { name: "Import from URL" }).focus();

		fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });

		expect(document.activeElement).toBe(trigger);
	});

	it("hands focus back to Add source when Escape closes the link field", () => {
		const { view, trigger } = openHub();
		fireEvent.click(view.getByRole("menuitem", { name: "Import from URL" }));
		view.getByRole("textbox", { name: "Gist or GitHub link" }).focus();

		fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });

		expect(document.activeElement).toBe(trigger);
	});
});
