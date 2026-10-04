import { parseHostedRenderOptions } from "@/application/render/hosted-render-job";
import {
	ASPECT_LABELS,
	RESOLUTION_TIERS,
	clampRenderDimension,
	dimensionsFor,
	isRenderDimension,
} from "@/domain/entities/render-config";
import { evenDimensions } from "@/infrastructure/export/video-encoding";
import { describe, expect, it } from "vitest";

const OPTIONS = { format: "mp4" as const, fps: 30 as const, includeAudio: false };

function hostedAccepts(width: number, height: number): boolean {
	try {
		parseHostedRenderOptions({ ...OPTIONS, width, height });
		return true;
	} catch {
		return false;
	}
}

/**
 * Three paths size a render: the hosted job validator (which the local V2
 * route reuses), the synchronous V1 route's clamp and the on-device exporter.
 * A size one of them keeps and another changes renders a different frame.
 */
describe("one render size rule for every path", () => {
	it("accepts the 4:5 and 3:4 portrait sizes up to 4K on every path", () => {
		for (const [width, height] of [
			[1080, 1350],
			[1440, 1800],
			[2160, 2700],
			[2160, 2880],
		] as const) {
			expect(hostedAccepts(width, height)).toBe(true);
			expect(clampRenderDimension(width, 0)).toBe(width);
			expect(clampRenderDimension(height, 0)).toBe(height);
			expect(evenDimensions(width, height)).toEqual({ width, height });
		}
	});

	it("accepts every shipped preset on every path", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				expect(hostedAccepts(width, height), `${aspect} ${tier}`).toBe(true);
			}
		}
	});

	it("agrees on every edge from 0 to 4000: kept untouched exactly when the rule allows it", () => {
		for (let edge = 0; edge <= 4000; edge += 1) {
			const allowed = isRenderDimension(edge);
			expect(hostedAccepts(edge, 1080), `hosted ${edge}`).toBe(allowed);
			expect(clampRenderDimension(edge, 0) === edge, `sync ${edge}`).toBe(allowed);
			if (allowed) {
				expect(evenDimensions(edge, 1080).width, `on-device ${edge}`).toBe(edge);
			}
		}
	});

	it("refuses odd, too small and too large sizes", () => {
		expect(isRenderDimension(1081)).toBe(false);
		expect(isRenderDimension(14)).toBe(false);
		expect(isRenderDimension(3842)).toBe(false);
		expect(isRenderDimension(1920.5)).toBe(false);
	});
});
