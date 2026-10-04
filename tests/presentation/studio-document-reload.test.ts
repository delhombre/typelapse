import { canonicalJson } from "@/application/project/canonical-json";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioProjectDocument,
	studioDocumentOf,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	restoreBlankStudioProject,
	restoreStudioProject,
} from "@/presentation/utils/studio-project-replacement";
import { beforeEach, describe, expect, it, vi } from "vitest";

const library = vi.hoisted(() => ({
	loadProject: vi.fn(),
	moveProject: vi.fn(),
	loadAsset: vi.fn(),
	saveProject: vi.fn(),
}));

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	return {
		studioLocalLibrary: library,
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: { create: vi.fn() },
	};
});

const LOCAL_PROJECT_ID = "3f0c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

/** What the account island fingerprints against the cloud copy. */
function islandDocument(): ProjectDocumentV2 {
	return studioDocumentOf(
		useStudioCompositionStore.getState().value,
		useSnippetStore.getState().snippet.code,
	);
}

describe("a reload with no edit", () => {
	beforeEach(() => {
		library.loadProject.mockReset();
		library.moveProject.mockReset().mockResolvedValue(null);
		library.loadAsset.mockReset().mockResolvedValue(null);
		useSnippetStore.getState().importFromJson(
			JSON.stringify({
				title: "Untitled",
				code: "const answer = 42;",
				language: "typescript",
				themeName: "midnight",
				background: "mesh:solar",
				steps: [],
			}),
		);
	});

	it("rebuilds the document the studio holds live, canonically equal", async () => {
		// First visit: nothing stored, the composition is the code alone.
		restoreBlankStudioProject(LOCAL_PROJECT_ID);
		// "Add scene": the editor's code becomes the first captured scene.
		useSnippetStore.getState().captureStep();
		// A render setting chosen after the composition was loaded.
		useSnippetStore.getState().setWatermark("typelapse.dev");
		// The save reconciles first, as the bridge does on every Studio change.
		const stored = readStudioProjectDocument();
		const live = islandDocument();
		const draft = JSON.stringify(useSnippetStore.getState().toProjectPayload());

		// Reload: the draft brings the code back (fresh step ids), then the boot
		// restore puts the stored composition on it.
		useSnippetStore.getState().importFromJson(draft);
		library.loadProject.mockResolvedValue(stored);
		await restoreStudioProject(LOCAL_PROJECT_ID, () => true, { adoptLegacy: true });

		expect(canonicalJson(islandDocument())).toBe(canonicalJson(live));
	});
});
