/**
 * The one way every renderer finds out how wide a column is.
 *
 * Glyphs land on the advance of the font the renderer actually resolved: the
 * DOM preview and the composition place tokens in `ch`, the painter in
 * `measureText("0")`. The card has to be sized on that same number, so all
 * three ask this function, at the same probe size, for the same glyph.
 */

import { BASE_VIDEO_SCALE } from "@/application/layout/canvas-fit";
import { advanceProbeFont, measureCharWidthRatio } from "@/application/layout/char-advance";
import { describe, expect, it } from "vitest";

function meter(advanceEm: number) {
	const seen: { font: string; text: string }[] = [];
	const ctx = {
		font: "",
		measureText(text: string) {
			seen.push({ font: ctx.font, text });
			const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? "0");
			return { width: advanceEm * size * text.length };
		},
	};
	return { ctx, seen };
}

describe("measureCharWidthRatio", () => {
	it("returns the advance of `0` divided by the probe size", () => {
		const { ctx } = meter(0.6);
		expect(measureCharWidthRatio(ctx, "'JetBrains Mono', monospace", 14)).toBeCloseTo(0.6, 10);
	});

	it("measures `0` at the base video size, so every scope probes the same size", () => {
		const { ctx, seen } = meter(0.6);
		measureCharWidthRatio(ctx, "'JetBrains Mono', monospace", 14);
		expect(seen).toEqual([
			{ font: advanceProbeFont("'JetBrains Mono', monospace", 14), text: "0" },
		]);
		expect(advanceProbeFont("'JetBrains Mono', monospace", 14)).toBe(
			`${14 * BASE_VIDEO_SCALE}px 'JetBrains Mono', monospace`,
		);
	});

	it("quotes a family with a space, or the canvas would silently keep its old font", () => {
		expect(advanceProbeFont("Fira Code, monospace", 10)).toBe(
			`${10 * BASE_VIDEO_SCALE}px "Fira Code", monospace`,
		);
	});
});
