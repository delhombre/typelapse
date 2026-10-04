import type { Asset, AudioAssetMetadata } from "../../domain/entities/asset";
import type { AudioCue, AudioCuePatch } from "../../domain/entities/audio-cue";
import type { Project } from "../../domain/entities/project";

export type SelectedAudioAsset = Asset & { readonly metadata: AudioAssetMetadata };

export interface AudioCueSelection {
	readonly cue: AudioCue;
	readonly asset: SelectedAudioAsset;
}

/** Resolve both authored occurrence and source metadata needed by timing controls. */
export function selectAudioCue(project: Project, cueId: string): AudioCueSelection {
	const cue = project.audioCues.find((candidate) => candidate.id === cueId);
	if (!cue) {
		throw new Error(`Audio cue ${cueId} does not belong to project`);
	}
	const asset = project.assets.find((candidate) => candidate.id === cue.assetId);
	if (!asset || asset.metadata.kind !== "audio") {
		throw new Error(`Audio cue ${cueId} does not resolve to an audio asset`);
	}
	return Object.freeze({ cue, asset: asset as SelectedAudioAsset });
}

/** Patch canonical cue values without letting source identity or duration drift. */
export function updateAudioCue(project: Project, cueId: string, patch: AudioCuePatch): Project {
	const { cue, asset } = selectAudioCue(project, cueId);
	const replacement = cue.withPatch(patch);
	if (replacement.trim.endMs > asset.metadata.durationMs) {
		throw new Error("Audio cue trim cannot exceed its source duration");
	}
	return project.replaceAudioCue(replacement);
}

/** Delete through the aggregate so the project can still protect its last content. */
export function deleteAudioCue(project: Project, cueId: string): Project {
	selectAudioCue(project, cueId);
	return project.removeAudioCue(cueId);
}
