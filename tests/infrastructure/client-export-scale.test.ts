/**
 * The tier has to reach the third renderer.
 *
 * The composition and the live preview both draw at `renderScaleFor(...)`, so a
 * higher tier is the same shot with more pixels in it. The client painter drew
 * at the flat base scale instead, which is not a smaller mistake than it sounds:
 * `fitScale` never enlarges, so the card came out at its 1080p pixel size and
 * was centred in a canvas four times the area. A 4K export was a 1080p card in
 * an ocean of mesh — the same text resolution as the 1080p file, at four times
 * the encode, and *softer* on screen once a player fit it to the display.
 *
 * These are the assertions that would have caught it.
 */

import { REFERENCE_SHORT_EDGE, renderScaleFor } from "@/application/layout/canvas-fit";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import type { ClientExportJob } from "@/infrastructure/export/client-export-job";
import { BASE_VIDEO_SCALE, sceneInputFor } from "@/infrastructure/export/client-export-scene";
import { describe, expect, it } from "vitest";

const plan: MagicMovePlan = {
	frames: [{ tokens: [{ key: "a", content: "const x = 1", col: 0, row: 0 }], lineCount: 1 }],
	transitions: [],
	typing: [],
} as unknown as MagicMovePlan;

function jobAt(width: number, height: number): ClientExportJob {
	return {
		plan,
		durations: [1000],
		firstCode: "const x = 1",
		focus: [[]],
		width,
		height,
		fps: 60,
		format: "mp4",
		transitionMs: 650,
		loop: false,
		typewriter: false,
		focusZoom: false,
		theme: {
			background: "#0d1117",
			foreground: "#e6edf3",
			fontFamily: "monospace",
			fontSize: 14,
			borderRadius: 12,
		},
		title: "t",
		background: "mesh:solar",
		chrome: "macos",
		padding: 24,
		cardMargin: 32,
		showLineNumbers: true,
		lineNumberStart: 1,
		progress: null,
		watermark: null,
		documentCharWidthRatio: 0.6,
	};
}

const sceneScaleAt = (width: number, height: number) =>
	sceneInputFor(jobAt(width, height), 0.6, { grain: null, backdropImage: null }).scale;

describe("the client painter's draw scale", () => {
	it("draws 1080p at the base scale exactly, so nothing that shipped moves", () => {
		expect(sceneScaleAt(1920, 1080)).toBeCloseTo(BASE_VIDEO_SCALE, 10);
	});

	it("doubles at 4K, so the tier buys pixels instead of empty background", () => {
		// Without this the card keeps its 1080p pixel size and gets centred: the
		// text in a 4K file is no sharper than in the 1080p one, and smaller.
		expect(sceneScaleAt(3840, 2160)).toBeCloseTo(BASE_VIDEO_SCALE * 2, 10);
		expect(sceneScaleAt(2560, 1440)).toBeCloseTo(BASE_VIDEO_SCALE * (1440 / 1080), 10);
	});

	it("anchors on the short edge, so a vertical 4K is a 4K and not a 1080p", () => {
		expect(sceneScaleAt(2160, 3840)).toBeCloseTo(sceneScaleAt(3840, 2160), 10);
	});

	it("agrees with the composition's own scale at every tier", () => {
		// The one assertion that actually matters: three renderers, one number.
		const tiers: [number, number][] = [
			[1920, 1080],
			[2560, 1440],
			[3840, 2160],
			[1080, 1920],
			[1080, 1080],
		];
		for (const [w, h] of tiers) {
			expect(sceneScaleAt(w, h)).toBeCloseTo(renderScaleFor(w, h, BASE_VIDEO_SCALE), 10);
		}
	});

	it("names the reference tier the same edge the tier names", () => {
		expect(REFERENCE_SHORT_EDGE).toBe(1080);
	});
});
