import {
	MIN_TIMELINE_MS,
	bubbleEdgeAtProgress,
	buildStudioTimeline,
	indexAtProgress,
	playbackProgressOnRuler,
	resizeDuration,
	stepProgress,
} from "@/application/studio-timeline/model";
import { describe, expect, it } from "vitest";

describe("studio timeline model", () => {
	it("keeps a twelve-second ruler when a short project leaves room for another scene", () => {
		const model = buildStudioTimeline([2000, 2000], 600);

		expect(model.actualDurationMs).toBe(4600);
		expect(model.displayDurationMs).toBe(MIN_TIMELINE_MS);
		expect(model.ticks.at(-1)).toBe(12);
	});

	it("keeps an editing tail after a project that is already longer than the default ruler", () => {
		const model = buildStudioTimeline([8000, 8000], 1000);

		expect(model.actualDurationMs).toBe(17_000);
		expect(model.displayDurationMs).toBe(19_000);
	});

	it("lays holds out as clips and leaves the morph visible between them", () => {
		const model = buildStudioTimeline([2000, 3000], 600);

		expect(model.clips).toEqual([
			{ index: 0, startMs: 0, endMs: 2000 },
			{ index: 1, startMs: 2600, endMs: 5600 },
		]);
		expect(model.transitions).toEqual([{ index: 0, startMs: 2000, endMs: 2600 }]);
		expect(stepProgress(model, 1)).toBeCloseTo(2600 / MIN_TIMELINE_MS);
	});

	it("resolves the closest visible step while crossing a morph", () => {
		const model = buildStudioTimeline([2000, 2000], 600);

		expect(indexAtProgress(model, 0)).toBe(0);
		expect(indexAtProgress(model, 2150 / MIN_TIMELINE_MS)).toBe(0);
		expect(indexAtProgress(model, 2450 / MIN_TIMELINE_MS)).toBe(1);
		expect(indexAtProgress(model, 1)).toBe(1);
	});

	it("maps playback progress onto the occupied part of a longer editing ruler", () => {
		const model = buildStudioTimeline([2000, 2000], 600);

		expect(playbackProgressOnRuler(model, 0.5)).toBeCloseTo(2300 / MIN_TIMELINE_MS);
		expect(playbackProgressOnRuler(model, 1)).toBeCloseTo(4600 / MIN_TIMELINE_MS);
	});

	it("snaps duration resizing to 100ms and clamps unsafe extremes", () => {
		expect(resizeDuration(2000, 27)).toBe(2500);
		expect(resizeDuration(600, -100)).toBe(400);
		expect(resizeDuration(9800, 100)).toBe(10_000);
	});

	it("keeps the time bubble inside the two ends of the ruler", () => {
		expect(bubbleEdgeAtProgress(0)).toBe("start");
		expect(bubbleEdgeAtProgress(0.02)).toBe("start");
		expect(bubbleEdgeAtProgress(0.5)).toBeUndefined();
		expect(bubbleEdgeAtProgress(0.98)).toBe("end");
		expect(bubbleEdgeAtProgress(1)).toBe("end");
	});
});
