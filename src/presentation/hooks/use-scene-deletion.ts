import type { Step } from "@/domain/entities/step";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useCallback, useEffect, useState } from "react";

interface PendingSceneDeletion {
	step: Step;
	index: number;
	sceneNumber: number;
	expectedRemainingIds: string[];
}

/**
 * A deletion is recovered where it happened, not in a global notification.
 *
 * The recovery stays valid only while the remaining timeline is untouched. If
 * another edit changes its shape, restoring at an old index would be a lie, so
 * the pending action quietly expires. It never expires on a clock: a scene is
 * real work, and a user who looks away for a few seconds must still be able to
 * get it back. The store remains the source of truth; this hook only owns the
 * local affordance.
 */
export function useSceneDeletion() {
	const steps = useSnippetStore((state) => state.snippet.steps);
	const removeStep = useSnippetStore((state) => state.removeStep);
	const restoreStep = useSnippetStore((state) => state.restoreStep);
	const [pendingDeletion, setPendingDeletion] = useState<PendingSceneDeletion | null>(null);

	const deleteScene = useCallback(
		(step: Step, index: number) => {
			const expectedRemainingIds = steps
				.filter((candidate) => candidate.id !== step.id)
				.map((candidate) => candidate.id);
			removeStep(step.id);
			setPendingDeletion({
				step,
				index,
				sceneNumber: index + 1,
				expectedRemainingIds,
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
		if (!timelineUnchanged) {
			setPendingDeletion(null);
			return false;
		}
		restoreStep(pendingDeletion.step, pendingDeletion.index);
		setPendingDeletion(null);
		return true;
	}, [pendingDeletion, restoreStep]);

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
