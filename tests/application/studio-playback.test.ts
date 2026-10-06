import { videoScript } from "@/application/export/video-script";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import {
	buildStudioPlayback,
	isPlayableProject,
	locateStudioPlayback,
} from "@/application/studio-timeline/playback";
import { describe, expect, it } from "vitest";

const NO_PLAN: MagicMovePlan = { frames: [], transitions: [] };

function exportedMs(durations: number[], transitionMs: number, loop: boolean, fps = 30): number {
	const script = videoScript({
		plan: NO_PLAN,
		durations,
		transitionMs,
		fps,
		loop,
		typewriter: false,
		firstCode: "",
		focusSets: [],
	});
	return (script.totalFrames / fps) * 1000;
}

describe("studio playback clock", () => {
	it("runs to the audio tail, not to the end of the last scene", () => {
		const timeline = buildStudioPlayback({
			durations: [1000, 1000],
			transitionMs: 600,
			loop: false,
			canonicalMs: 20_000,
		});

		expect(timeline.scenesEndMs).toBe(2600);
		expect(timeline.totalMs).toBe(20_000);
		const position = locateStudioPlayback(timeline, 10_000);
		expect(position).toMatchObject({ phase: "hold", index: 1, t: 1, elapsedMs: 10_000 });
		expect(position.progress).toBeCloseTo(0.5);
	});

	it("plays a single scene for exactly its own duration", () => {
		const timeline = buildStudioPlayback({
			durations: [2000],
			transitionMs: 650,
			loop: true,
			canonicalMs: 2000,
		});

		expect(timeline.totalMs).toBe(2000);
		expect(timeline.segments.map((segment) => segment.type)).toEqual(["hold"]);
		expect(locateStudioPlayback(timeline, 1000)).toMatchObject({ phase: "hold", index: 0, t: 0.5 });
	});

	it("plays audio alone when there is no captured scene", () => {
		const timeline = buildStudioPlayback({
			durations: [],
			transitionMs: 650,
			loop: false,
			canonicalMs: 20_000,
		});

		expect(timeline.totalMs).toBe(20_000);
		expect(locateStudioPlayback(timeline, 5000)).toMatchObject({
			phase: "hold",
			index: 0,
			elapsedMs: 5000,
		});
	});

	it("adds the last-to-first morph exactly where the exported file adds it", () => {
		const timeline = buildStudioPlayback({
			durations: [1000, 2000],
			transitionMs: 1000,
			loop: true,
			canonicalMs: 4000,
		});

		expect(timeline.segments.at(-1)).toEqual({
			type: "loop",
			index: 1,
			startMs: 4000,
			endMs: 5000,
		});
		expect(timeline.totalMs).toBe(5000);
		expect(timeline.totalMs).toBe(exportedMs([1000, 2000], 1000, true));
		expect(locateStudioPlayback(timeline, 4500)).toMatchObject({ phase: "loop", index: 1, t: 0.5 });
	});

	it("matches the exported duration with Loop off too", () => {
		const timeline = buildStudioPlayback({
			durations: [1000, 2000],
			transitionMs: 1000,
			loop: false,
			canonicalMs: 4000,
		});

		expect(timeline.totalMs).toBe(exportedMs([1000, 2000], 1000, false));
	});

	it("counts the loop morph on a multimedia project like the file it renders", () => {
		const document: ProjectDocumentV2 = {
			schemaVersion: 2,
			project: {
				id: "loop-multimedia",
				title: "Loop",
				canvas: { width: 1920, height: 1080, background: "#111111" },
				settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
				assets: [],
				audioCues: [],
				scenes: [
					{
						id: "scene-1",
						durationMs: 1_000,
						transitionOut: { kind: "magic-move", durationMs: 650 },
						blocks: [],
					},
					{
						id: "scene-2",
						durationMs: 2_000,
						blocks: [
							{
								id: "title",
								kind: "text",
								text: "Loop",
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
								typography: {
									fontFamily: "Inter",
									fontSize: 72,
									fontWeight: 700,
									color: "#ffffff",
									align: "center",
								},
							},
						],
					},
				],
			},
		};
		const file = compileSceneTimeline({ document, fps: 30, loop: true });
		const timeline = buildStudioPlayback({
			durations: [1_000, 2_000],
			transitionMs: 650,
			loop: true,
			canonicalMs: file.durationMs,
		});

		expect(file.durationMs).toBe(4_300);
		expect(timeline.totalMs).toBe(file.durationMs);
		expect(timeline.segments.at(-1)).toMatchObject({ type: "loop", startMs: 3_650, endMs: 4_300 });
	});

	it("clamps a clock past either end onto the first and the last frame", () => {
		const timeline = buildStudioPlayback({
			durations: [1000, 1000],
			transitionMs: 500,
			loop: false,
			canonicalMs: 2500,
		});

		expect(locateStudioPlayback(timeline, -50)).toMatchObject({ phase: "hold", index: 0, t: 0 });
		expect(locateStudioPlayback(timeline, 9000)).toMatchObject({
			phase: "hold",
			index: 1,
			t: 1,
			progress: 1,
			elapsedMs: 2500,
		});
	});
});

describe("what counts as a video", () => {
	it("is one scene or more, or authored media such as audio alone", () => {
		expect(isPlayableProject(1, false)).toBe(true);
		expect(isPlayableProject(0, true)).toBe(true);
		expect(isPlayableProject(0, false)).toBe(false);
	});

	it("is nothing with no scene and an emptied editor, media or not, since no code is on screen", () => {
		expect(isPlayableProject(0, true, true)).toBe(false);
		expect(isPlayableProject(0, false, true)).toBe(false);
	});

	it("is unchanged by an emptied editor once there is a scene: it has its own code", () => {
		expect(isPlayableProject(1, false, true)).toBe(true);
		expect(isPlayableProject(2, true, true)).toBe(true);
	});
});
