import { previewAudioOffsetSeconds } from "@/presentation/hooks/use-tick-audio";
import { describe, expect, it } from "vitest";

describe("preview audio resume offset", () => {
	it("starts at the scrubbed film time plus decode latency", () => {
		expect(previewAudioOffsetSeconds(0.5, 5000, 100, 5)).toBeCloseTo(2.6);
	});

	it("clamps stale progress and decode time to the available buffer", () => {
		expect(previewAudioOffsetSeconds(2, 5000, 2000, 5)).toBe(5);
		expect(previewAudioOffsetSeconds(-1, 5000, -200, 5)).toBe(0);
	});
});
