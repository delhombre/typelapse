import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";

export type EditorKind = "Code" | "Text" | "Image" | "Video" | "Audio";

/**
 * What the editor slot is showing: the code, or the inspector of the layer
 * selected over it. The desktop card and the phone sheet label the slot with
 * it, so the two cannot name it differently.
 */
export function useEditorKind(): EditorKind {
	const selectedAudioCueId = useStudioCompositionSelectionStore(
		(state) => state.selectedAudioCueId,
	);
	const kind = useStudioCompositionStore((state) => {
		const scene = state.value.project.scenes.find(
			(candidate) => candidate.id === state.selectedSceneId,
		);
		return scene?.blocks.find((block) => block.id === state.selectedBlockId)?.kind ?? null;
	});
	if (selectedAudioCueId) {
		return "Audio";
	}
	return kind === "text"
		? "Text"
		: kind === "image"
			? "Image"
			: kind === "video"
				? "Video"
				: "Code";
}
