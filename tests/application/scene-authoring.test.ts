import {
	DEFAULT_SCENE_TRANSITION_DURATION_MS,
	MAX_SCENE_DURATION_MS,
	MAX_SCENE_TRANSITION_DURATION_MS,
	MIN_SCENE_DURATION_MS,
	MIN_SCENE_TRANSITION_DURATION_MS,
	moveSceneNext,
	moveScenePrevious,
	moveSceneToIndex,
	updateSceneDuration,
	updateSceneTransition,
} from "@/application/project/scene-authoring";
import { TextBlock } from "@/domain/entities/block";
import { Project } from "@/domain/entities/project";
import { Scene } from "@/domain/entities/scene";
import { describe, expect, it } from "vitest";

function scene(id: string, durationMs: number) {
	return Scene.create({
		id,
		durationMs,
		blocks: [
			TextBlock.create({
				id: `${id}-text`,
				text: id,
				typography: {
					fontFamily: "Geist",
					fontSize: 72,
					fontWeight: 650,
					color: "#ffffff",
					align: "center",
				},
			}),
		],
	});
}

function project() {
	return Project.create({
		id: "project-rhythm",
		title: "Scene rhythm",
		canvas: { width: 1920, height: 1080, background: "#101010" },
		scenes: [scene("scene-1", 1_000), scene("scene-2", 2_000), scene("scene-3", 3_000)],
	});
}

describe("scene authoring", () => {
	it("updates scene hold duration immutably and recomputes the project rhythm", () => {
		const original = project();

		const updated = updateSceneDuration(original, "scene-2", 2_400);

		expect(updated).not.toBe(original);
		expect(updated.scenes[1]?.durationMs).toBe(2_400);
		expect(updated.durationMs).toBe(6_400);
		expect(original.scenes[1]?.durationMs).toBe(2_000);
		expect(original.durationMs).toBe(6_000);
	});

	it("keeps authored scene and animated-transition timings inside explicit bounds", () => {
		const original = project();

		expect(() => updateSceneDuration(original, "scene-2", MIN_SCENE_DURATION_MS - 1)).toThrow(
			`Scene duration must be between ${MIN_SCENE_DURATION_MS} and ${MAX_SCENE_DURATION_MS} ms`,
		);
		expect(() => updateSceneDuration(original, "scene-2", MAX_SCENE_DURATION_MS + 1)).toThrow(
			`Scene duration must be between ${MIN_SCENE_DURATION_MS} and ${MAX_SCENE_DURATION_MS} ms`,
		);
		expect(() => updateSceneDuration(original, "scene-2", 1_000.5)).toThrow(
			"Scene duration must be a whole number of milliseconds",
		);

		expect(() =>
			updateSceneTransition(original, "scene-2", {
				kind: "crossfade",
				durationMs: MIN_SCENE_TRANSITION_DURATION_MS - 1,
			}),
		).toThrow(
			`Animated transition duration must be between ${MIN_SCENE_TRANSITION_DURATION_MS} and ${MAX_SCENE_TRANSITION_DURATION_MS} ms`,
		);
		expect(() =>
			updateSceneTransition(original, "scene-2", {
				kind: "magic-move",
				durationMs: MAX_SCENE_TRANSITION_DURATION_MS + 1,
			}),
		).toThrow(
			`Animated transition duration must be between ${MIN_SCENE_TRANSITION_DURATION_MS} and ${MAX_SCENE_TRANSITION_DURATION_MS} ms`,
		);
	});

	it("updates animated and cut transitions without mutating the source project", () => {
		const original = project();
		const morphed = updateSceneTransition(original, "scene-1", {
			kind: "magic-move",
			durationMs: DEFAULT_SCENE_TRANSITION_DURATION_MS,
		});
		const cut = updateSceneTransition(morphed, "scene-1", { kind: "cut", durationMs: 0 });

		expect(morphed.scenes[0]?.transitionOut).toEqual({
			kind: "magic-move",
			durationMs: DEFAULT_SCENE_TRANSITION_DURATION_MS,
		});
		expect(morphed.durationMs).toBe(6_000 + DEFAULT_SCENE_TRANSITION_DURATION_MS);
		expect(cut.scenes[0]?.transitionOut).toEqual({ kind: "cut", durationMs: 0 });
		expect(cut.durationMs).toBe(6_000);
		expect(original.scenes[0]?.transitionOut).toBeUndefined();
	});

	it("moves a scene to a final index while preserving scene identity and total duration", () => {
		const original = project();
		const second = original.scenes[1];

		const updated = moveSceneToIndex(original, "scene-2", 0);

		expect(updated.scenes.map((candidate) => candidate.id)).toEqual([
			"scene-2",
			"scene-1",
			"scene-3",
		]);
		expect(updated.scenes[0]).toBe(second);
		expect(updated.durationMs).toBe(original.durationMs);
		expect(original.scenes.map((candidate) => candidate.id)).toEqual([
			"scene-1",
			"scene-2",
			"scene-3",
		]);
	});

	it("clamps scene moves to timeline ends and makes edge moves stable no-ops", () => {
		const original = project();

		expect(moveSceneToIndex(original, "scene-2", -20).scenes.map((scene) => scene.id)).toEqual([
			"scene-2",
			"scene-1",
			"scene-3",
		]);
		expect(moveSceneToIndex(original, "scene-2", 20).scenes.map((scene) => scene.id)).toEqual([
			"scene-1",
			"scene-3",
			"scene-2",
		]);
		expect(moveScenePrevious(original, "scene-1")).toBe(original);
		expect(moveSceneNext(original, "scene-3")).toBe(original);
		expect(moveScenePrevious(original, "scene-2").scenes.map((scene) => scene.id)).toEqual([
			"scene-2",
			"scene-1",
			"scene-3",
		]);
		expect(moveSceneNext(original, "scene-2").scenes.map((scene) => scene.id)).toEqual([
			"scene-1",
			"scene-3",
			"scene-2",
		]);
	});

	it("rejects unknown scenes and non-integral reorder destinations", () => {
		const original = project();

		expect(() => moveSceneToIndex(original, "missing", 0)).toThrow(
			"Scene missing does not belong to project",
		);
		expect(() => moveSceneToIndex(original, "scene-2", 1.5)).toThrow(
			"Scene target index must be an integer",
		);
		expect(() => updateSceneDuration(original, "missing", 1_000)).toThrow(
			"Scene missing does not belong to project",
		);
	});
});
