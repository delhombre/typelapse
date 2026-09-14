import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { describe, expect, it } from "vitest";

function textBlock(input: {
	readonly id: string;
	readonly text: string;
	readonly x: number;
	readonly continuityKey?: string;
}) {
	return {
		id: input.id,
		kind: "text" as const,
		text: input.text,
		opacity: 0.8,
		placement: { x: input.x, y: 0.2, width: 0.2, height: 0.2 },
		...(input.continuityKey ? { continuityKey: input.continuityKey } : {}),
		typography: {
			fontFamily: "Inter",
			fontSize: 48,
			fontWeight: 700,
			color: "#ffffff",
			align: "center" as const,
		},
	};
}

function project(kind: "crossfade" | "magic-move"): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "motion-project",
			title: "Continuity",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: "scene-before",
					durationMs: 1_000,
					blocks: [
						textBlock({
							id: "title-before",
							text: "Before",
							x: 0.1,
							continuityKey: "title",
						}),
					],
					transitionOut: { kind, durationMs: 1_000 },
				},
				{
					id: "scene-after",
					durationMs: 1_000,
					blocks: [
						textBlock({
							id: "title-after",
							text: "After",
							x: 0.7,
							continuityKey: "title",
						}),
					],
				},
			],
		},
	};
}

describe("scene continuity magic move", () => {
	it("moves continuity-linked layers through one eased geometry while their contents blend", () => {
		const timeline = compileSceneTimeline({ document: project("magic-move"), fps: 20 });

		const quarter = timeline.frameAt(25);
		const middle = timeline.frameAt(30);

		expect(quarter.transition).toMatchObject({ kind: "magic-move", progress: 0.25 });
		expect(quarter.layers).toHaveLength(2);
		expect(quarter.layers.map((layer) => layer.placement.x)).toEqual([
			0.11875000000000001, 0.11875000000000001,
		]);
		expect(middle.layers.map((layer) => layer.placement.x)).toEqual([0.4, 0.4]);
		expect(middle.layers.map((layer) => layer.opacity)).toEqual([0.4, 0.4]);
	});

	it("keeps ordinary crossfades in each scene's own geometry", () => {
		const timeline = compileSceneTimeline({ document: project("crossfade"), fps: 20 });
		const middle = timeline.frameAt(30);

		expect(middle.layers.map((layer) => layer.placement.x)).toEqual([0.1, 0.7]);
	});
});
