import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { Asset } from "@/domain/entities/asset";
import { StudioUtilities } from "@/presentation/components/layout/studio-utilities";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import {
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { openStudioProjectDocument } from "@/presentation/utils/studio-project-replacement";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** "Export project file" downloads the V2 document, and says when media stays behind. */

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

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	const { BrowserObjectUrlSceneAssetSourceFactory } = await import(
		"@/infrastructure/assets/browser-local-media-importer"
	);
	return {
		studioLocalLibrary: { loadAsset: async () => null },
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: new BrowserObjectUrlSceneAssetSourceFactory({
			createObjectURL: () => "blob:test",
			revokeObjectURL: () => undefined,
		}),
	};
});

let downloaded: Blob | null = null;

beforeEach(() => {
	downloaded = null;
	useNoticeStore.setState({ notices: [] });
	URL.createObjectURL = vi.fn((blob: Blob) => {
		downloaded = blob;
		return "blob:download";
	}) as typeof URL.createObjectURL;
	URL.revokeObjectURL = vi.fn();
	HTMLAnchorElement.prototype.click = vi.fn();
	openStudioProjectDocument(
		JSON.stringify({
			title: "Export me",
			code: "const b = 2;",
			language: "typescript",
			themeName: "midnight",
			steps: [
				{ code: "const a = 1;", duration: 1000 },
				{ code: "const b = 2;", duration: 1000 },
			],
		}),
	);
	synchronizeStudioCompositionStore();
});

afterEach(cleanup);

async function exportFile(): Promise<ProjectDocumentV2> {
	render(<StudioUtilities />);
	fireEvent.click(screen.getByRole("button", { name: "Export project file" }));
	if (!downloaded) {
		throw new Error("nothing was downloaded");
	}
	const blob = downloaded as Blob;
	const text = await new Promise<string>((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.readAsText(blob);
	});
	return JSON.parse(text) as ProjectDocumentV2;
}

function sceneId(): string {
	return useStudioCompositionStore.getState().value.project.scenes[0]?.id ?? "";
}

describe("Export project file", () => {
	it("downloads the V2 document with the text layers in it and says nothing more", async () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addTextLayer(project, sceneId(), { text: "Kept" }));

		const file = await exportFile();

		expect(file.schemaVersion).toBe(2);
		expect(file.project.scenes).toHaveLength(2);
		expect(
			file.project.scenes.flatMap((scene) => scene.blocks).some((block) => block.kind === "text"),
		).toBe(true);
		expect(useNoticeStore.getState().notices).toEqual([]);
	});

	it("says the media files themselves stay on this device", async () => {
		const image = Asset.create({
			id: "export-image",
			kind: "image",
			fileName: "still.png",
			mimeType: "image/png",
			byteSize: 4,
			checksum: "d".repeat(64),
			width: 10,
			height: 10,
		});
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, sceneId(), image, { blockId: "img" }));

		const file = await exportFile();

		expect(file.project.assets.map((asset) => asset.id)).toEqual(["export-image"]);
		const [notice] = useNoticeStore.getState().notices;
		expect(notice?.message).toMatch(/media/i);
		expect(notice?.message).not.toMatch(/code scenes only/i);
	});
});
