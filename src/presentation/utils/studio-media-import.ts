import { addMediaAsset } from "@/application/project/multimedia-authoring";
import { notify } from "@/presentation/stores/notice.store";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	studioLocalLibrary,
	studioMediaImporter,
	studioMediaRegistry,
} from "@/presentation/studio-media-runtime";
import { whenStudioCompositionReady } from "@/presentation/utils/studio-composition-ready";

function refusal(error: unknown): string {
	if (error instanceof DOMException && error.name === "QuotaExceededError") {
		return "This browser has no room left to keep this file.";
	}
	return error instanceof Error && error.message ? error.message : "This media could not be added.";
}

/**
 * One file into the open project: its bytes into IndexedDB, its layer onto the
 * selected scene (or its cue onto the audio track, at 0: the track is global and
 * the inspector moves it). Throws the sentence to show when it is refused.
 */
async function importOne(file: File): Promise<void> {
	await whenStudioCompositionReady();
	const result = await studioMediaImporter.importFile(file);
	try {
		// Hashing a large file takes long enough for a project switch to begin.
		await whenStudioCompositionReady();
		const composition = useStudioCompositionStore.getState();
		const project = composition.value.project;
		const sceneId = composition.selectedSceneId ?? project.scenes[0]?.id;
		if (!sceneId) {
			throw new Error("Add a scene before adding media.");
		}
		await studioLocalLibrary.saveAsset({
			projectId: project.id,
			assetId: result.asset.id,
			mimeType: result.asset.metadata.mimeType,
			byteSize: result.asset.metadata.byteSize,
			opaqueHandle: file,
		});
		const blockId = crypto.randomUUID();
		const cueId = crypto.randomUUID();
		const current = useStudioCompositionStore.getState();
		current.transact((draft) => addMediaAsset(draft, sceneId, result.asset, { blockId, cueId }));
		if (result.asset.kind === "audio") {
			current.selectBlock(sceneId, null);
			useStudioCompositionSelectionStore.getState().selectAudioCue(cueId);
		} else {
			current.selectBlock(sceneId, blockId);
			useStudioCompositionSelectionStore.getState().selectAudioCue(null);
		}
	} catch (error) {
		studioMediaRegistry.revoke(result.asset.id);
		throw error;
	}
}

/**
 * Import files one after another, from the picker or a drop. Each refusal is a
 * notice that names the file and the reason; the others still land. Returns how
 * many were added.
 */
export async function importStudioMediaFiles(files: readonly File[]): Promise<number> {
	let added = 0;
	for (const file of files) {
		try {
			await importOne(file);
			added += 1;
		} catch (error) {
			notify(refusal(error), { tone: "error", detail: file.name });
		}
	}
	return added;
}
