import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { describe, expect, it } from "vitest";

describe("buildTimeline", () => {
	it("alternates holds and transitions without a trailing transition", () => {
		const { segments, totalMs } = buildTimeline([1000, 1000], 500);

		expect(segments.map((s) => s.type)).toEqual(["hold", "transition", "hold"]);
		expect(totalMs).toBe(2500);
	});

	it("positions segments contiguously", () => {
		const { segments } = buildTimeline([1000, 2000], 300);

		expect(segments[0]).toMatchObject({ startMs: 0, endMs: 1000 });
		expect(segments[1]).toMatchObject({ startMs: 1000, endMs: 1300 });
		expect(segments[2]).toMatchObject({ startMs: 1300, endMs: 3300 });
	});

	it("handles a single step with no transitions", () => {
		const { segments, totalMs } = buildTimeline([1000]);
		expect(segments).toHaveLength(1);
		expect(totalMs).toBe(1000);
	});
});

describe("buildTimeline tempo", () => {
	it("uses a 400ms snappy transition", () => {
		const { segments, totalMs } = buildTimeline([1000, 1000], 400);
		expect(segments[1]).toMatchObject({ type: "transition", startMs: 1000, endMs: 1400 });
		expect(totalMs).toBe(2400);
	});

	it("uses a 1000ms cinematic transition", () => {
		const { segments, totalMs } = buildTimeline([1000, 1000], 1000);
		expect(segments[1]).toMatchObject({ type: "transition", startMs: 1000, endMs: 2000 });
		expect(totalMs).toBe(3000);
	});

	it("locates the transition midpoint under a slow tempo", () => {
		const timeline = buildTimeline([1000, 1000], 1000);
		const pos = locate(timeline, 1500);
		expect(pos.phase).toBe("transition");
		expect(pos.index).toBe(0);
		expect(pos.t).toBeCloseTo(0.5);
	});
});

describe("locate", () => {
	const timeline = buildTimeline([1000, 1000], 500);

	it("reports a hold at the start", () => {
		expect(locate(timeline, 0)).toMatchObject({ phase: "hold", index: 0, t: 0 });
	});

	it("reports the transition midpoint", () => {
		const pos = locate(timeline, 1250);
		expect(pos.phase).toBe("transition");
		expect(pos.index).toBe(0);
		expect(pos.t).toBeCloseTo(0.5);
	});

	it("reports the second hold", () => {
		expect(locate(timeline, 2000)).toMatchObject({ phase: "hold", index: 1 });
	});

	it("clamps past the end to the final hold", () => {
		const pos = locate(timeline, 9999);
		expect(pos.phase).toBe("hold");
		expect(pos.index).toBe(1);
		expect(pos.progress).toBe(1);
	});
});
