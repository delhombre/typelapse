import type { Project } from "../../domain/entities/project";
import type { Scene, SceneTransition } from "../../domain/entities/scene";

/** Creative-tool bounds: short beats remain editable without permitting accidental zeroes. */
export const MIN_SCENE_DURATION_MS = 200;
export const MAX_SCENE_DURATION_MS = 120_000;
export const MIN_SCENE_TRANSITION_DURATION_MS = 100;
export const MAX_SCENE_TRANSITION_DURATION_MS = 5_000;
export const DEFAULT_SCENE_TRANSITION_DURATION_MS = 450;

function selectedScene(project: Project, sceneId: string): Scene {
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) {
		throw new Error(`Scene ${sceneId} does not belong to project`);
	}
	return scene;
}

function assertWholeMilliseconds(value: number, label: string): void {
	if (!Number.isSafeInteger(value)) {
		throw new Error(`${label} must be a whole number of milliseconds`);
	}
}

export function updateSceneDuration(
	project: Project,
	sceneId: string,
	durationMs: number,
): Project {
	const scene = selectedScene(project, sceneId);
	assertWholeMilliseconds(durationMs, "Scene duration");
	if (durationMs < MIN_SCENE_DURATION_MS || durationMs > MAX_SCENE_DURATION_MS) {
		throw new Error(
			`Scene duration must be between ${MIN_SCENE_DURATION_MS} and ${MAX_SCENE_DURATION_MS} ms`,
		);
	}
	if (durationMs === scene.durationMs) {
		return project;
	}
	return project.replaceScene(scene.withDuration(durationMs));
}

export function updateSceneTransition(
	project: Project,
	sceneId: string,
	transition: SceneTransition,
): Project {
	const scene = selectedScene(project, sceneId);
	assertWholeMilliseconds(transition.durationMs, "Transition duration");
	if (
		transition.kind !== "cut" &&
		(transition.durationMs < MIN_SCENE_TRANSITION_DURATION_MS ||
			transition.durationMs > MAX_SCENE_TRANSITION_DURATION_MS)
	) {
		throw new Error(
			`Animated transition duration must be between ${MIN_SCENE_TRANSITION_DURATION_MS} and ${MAX_SCENE_TRANSITION_DURATION_MS} ms`,
		);
	}
	if (
		scene.transitionOut?.kind === transition.kind &&
		scene.transitionOut.durationMs === transition.durationMs
	) {
		return project;
	}
	return project.replaceScene(scene.withTransition(transition));
}

function sceneIndex(project: Project, sceneId: string): number {
	selectedScene(project, sceneId);
	return project.scenes.findIndex((candidate) => candidate.id === sceneId);
}

/**
 * Move to a final timeline index. Pointer overshoot is intentionally clamped so
 * a drag can land beyond either edge without turning a valid gesture into an error.
 */
export function moveSceneToIndex(project: Project, sceneId: string, targetIndex: number): Project {
	if (!Number.isSafeInteger(targetIndex)) {
		throw new Error("Scene target index must be an integer");
	}
	const currentIndex = sceneIndex(project, sceneId);
	const finalIndex = Math.min(Math.max(targetIndex, 0), project.scenes.length - 1);
	if (currentIndex === finalIndex) {
		return project;
	}

	const orderedIds = project.scenes.map((scene) => scene.id);
	const [movedId] = orderedIds.splice(currentIndex, 1);
	if (!movedId) {
		return project;
	}
	orderedIds.splice(finalIndex, 0, movedId);
	return project.reorderScenes(orderedIds);
}

export function moveScenePrevious(project: Project, sceneId: string): Project {
	const currentIndex = sceneIndex(project, sceneId);
	return moveSceneToIndex(project, sceneId, currentIndex - 1);
}

export function moveSceneNext(project: Project, sceneId: string): Project {
	const currentIndex = sceneIndex(project, sceneId);
	return moveSceneToIndex(project, sceneId, currentIndex + 1);
}
