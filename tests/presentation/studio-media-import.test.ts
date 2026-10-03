import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { setStudioCompositionRestored } from "@/presentation/utils/studio-composition-ready";
import { importStudioMediaFiles } from "@/presentation/utils/studio-media-import";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	importFile: vi.fn(),
	saveAsset: vi.fn(),
	revoke: vi.fn(),
}));

vi.mock("@/presentation/studio-media-runtime", () => ({
	studioMediaImporter: { importFile: runtime.importFile },
	studioLocalLibrary: { saveAsset: runtime.saveAsset },
	studioMediaRegistry: { revoke: runtime.revoke, resolve: () => null },
}));

function audioAsset(id: string) {
	return Asset.create({
		id,
		kind: "audio",
		fileName: `${id}.wav`,
		mimeType: "audio/wav",
		byteSize: 4,
		checksum: "c".repeat(64),
		durationMs: 1_000,
	});
}

function imageAsset(id: string) {
	return Asset.create({
		id,
		kind: "image",
		fileName: `${id}.png`,
		mimeType: "image/png",
		byteSize: 4,
		checksum: "a".repeat(64),
		width: 10,
		height: 10,
	});
}

function file(name: string, type: string): File {
	return new File(["data"], name, { type });
}

/** Two scenes, the second selected: where a cue used to start. */
function loadTwoScenes() {
	const snapshot = readStudioCompositionSnapshot();
	const scene = snapshot.scenes[0];
	if (!scene) throw new Error("The studio snapshot must have a scene");
	useStudioCompositionStore.getState().loadDocument(
		createStudioCompositionDocument({
			...snapshot,
			projectId: "project-1",
			scenes: [
				{ ...scene, id: "scene-1", durationMs: 2_000 },
				{ ...scene, id: "scene-2", durationMs: 2_000 },
			],
		}),
	);
	useStudioCompositionStore.getState().selectScene("scene-2");
}

describe("importStudioMediaFiles", () => {
	beforeEach(() => {
		runtime.importFile.mockReset();
		runtime.saveAsset.mockReset().mockResolvedValue(undefined);
		runtime.revoke.mockReset();
		useNoticeStore.setState({ notices: [] });
		setStudioCompositionRestored(true);
		loadTwoScenes();
	});

	it("adds every file, on the selected scene, and starts a new cue at 0", async () => {
		runtime.importFile
			.mockResolvedValueOnce({ asset: imageAsset("img"), source: {} })
			.mockResolvedValueOnce({ asset: audioAsset("snd"), source: {} });

		await act(() =>
			importStudioMediaFiles([file("still.png", "image/png"), file("voice.wav", "audio/wav")]),
		);

		const project = useStudioCompositionStore.getState().value.project;
		expect(project.assets.map((asset) => asset.id)).toEqual(["img", "snd"]);
		expect(
			project.scenes
				.find((scene) => scene.id === "scene-2")
				?.blocks.some((b) => b.kind === "image"),
		).toBe(true);
		// The track is global; the inspector moves a cue, the import does not guess.
		expect(project.audioCues[0]?.startMs).toBe(0);
		expect(runtime.saveAsset).toHaveBeenCalledTimes(2);
		expect(useStudioCompositionSelectionStore.getState().selectedAudioCueId).toBe(
			project.audioCues[0]?.id,
		);
	});

	it("waits for the open project to be restored instead of losing the import", async () => {
		setStudioCompositionRestored(false);
		runtime.importFile.mockResolvedValue({ asset: imageAsset("early"), source: {} });

		const done = importStudioMediaFiles([file("early.png", "image/png")]);
		await act(async () => {
			await Promise.resolve();
		});
		expect(useStudioCompositionStore.getState().value.project.assets).toHaveLength(0);

		// The restore replaces the composition; the import must land on the result.
		loadTwoScenes();
		setStudioCompositionRestored(true);
		await act(() => done);

		expect(useStudioCompositionStore.getState().value.project.assets.map((a) => a.id)).toEqual([
			"early",
		]);
	});

	it("says why a file was refused, names it, and keeps going with the next one", async () => {
		runtime.importFile
			.mockRejectedValueOnce(new Error("This file is empty."))
			.mockResolvedValueOnce({ asset: imageAsset("ok"), source: {} });

		const added = await act(() =>
			importStudioMediaFiles([file("blank.png", "image/png"), file("ok.png", "image/png")]),
		);

		expect(added).toBe(1);
		expect(useNoticeStore.getState().notices).toMatchObject([
			{ message: "This file is empty.", detail: "blank.png", tone: "error" },
		]);
	});

	it("explains a full device rather than a storage error name", async () => {
		runtime.importFile.mockResolvedValue({ asset: imageAsset("big"), source: {} });
		runtime.saveAsset.mockRejectedValue(new DOMException("quota", "QuotaExceededError"));

		await act(() => importStudioMediaFiles([file("big.png", "image/png")]));

		expect(runtime.revoke).toHaveBeenCalledWith("big");
		expect(useStudioCompositionStore.getState().value.project.assets).toHaveLength(0);
		expect(useNoticeStore.getState().notices[0]?.message).toBe(
			"This browser has no room left to keep this file.",
		);
	});
});
