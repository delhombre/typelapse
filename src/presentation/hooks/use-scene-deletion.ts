import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { Step } from "@/domain/entities/step";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useCallback, useEffect, useState } from "react";

interface PendingSceneDeletion {
	step: Step;
	index: number;
	sceneNumber: number;
	expectedRemainingIds: string[];
	/** The history entry the deletion made; undo is only this deletion's while it is the present. */
	entry: ProjectDocumentV2 | null;
}

/**
 * A deletion is recovered where it happened, not in a global notification.
 *
 * The recovery stays valid only while the remaining timeline is untouched. If
 * another edit changes its shape, restoring at an old index would be a lie, so
 * the pending action quietly expires. It never expires on a clock: a scene is
 * real work, and a user who looks away for a few seconds must still be able to
 * get it back. The project history does the undoing, so the deletion can be
 * redone and Cmd+Z reaches it too; this hook only owns the local affordance, and
 * it hands over only while the deletion is still the latest entry.
 */
export function useSceneDeletion() {
	const steps = useSnippetStore((state) => state.snippet.steps);
	const removeStep = useSnippetStore((state) => state.removeStep);
	const [pendingDeletion, setPendingDeletion] = useState<PendingSceneDeletion | null>(null);

	const deleteScene = useCallback(
		(step: Step, index: number) => {
			const expectedRemainingIds = steps
				.filter((candidate) => candidate.id !== step.id)
				.map((candidate) => candidate.id);
			// Checkpoint on both sides, so the deletion is one entry of its own
			// even before the history's next observation.
			studioHistory.capture();
			removeStep(step.id);
			studioHistory.capture();
			setPendingDeletion({
				step,
				index,
				sceneNumber: index + 1,
				expectedRemainingIds,
				entry: studioHistory.present(),
			});
		},
		[removeStep, steps],
	);

	const undoDeletion = useCallback(() => {
		if (!pendingDeletion) {
			return false;
		}
		const currentIds = useSnippetStore.getState().snippet.steps.map((step) => step.id);
		const timelineUnchanged =
			currentIds.length === pendingDeletion.expectedRemainingIds.length &&
			currentIds.every((id, index) => id === pendingDeletion.expectedRemainingIds[index]);
		studioHistory.capture();
		const stillLatest = studioHistory.present() === pendingDeletion.entry;
		setPendingDeletion(null);
		return timelineUnchanged && stillLatest && studioHistory.undo();
	}, [pendingDeletion]);

	useEffect(() => {
		if (!pendingDeletion) {
			return;
		}
		const currentIds = steps.map((step) => step.id);
		const timelineUnchanged =
			currentIds.length === pendingDeletion.expectedRemainingIds.length &&
			currentIds.every((id, index) => id === pendingDeletion.expectedRemainingIds[index]);
		if (!timelineUnchanged) {
			setPendingDeletion(null);
		}
	}, [pendingDeletion, steps]);

	return { pendingDeletion, deleteScene, undoDeletion };
}
