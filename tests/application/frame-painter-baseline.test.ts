/**
 * The three drifts #90's proof left on the painter (ticket #93):
 *
 * - glyphs sat about 2 px above both DOM renderers, because `textBaseline =
 *   "middle"` is the em box's middle and CSS puts the baseline at half the
 *   leading plus the font's ascent;
 * - the watermark kept 1080p pixels at every tier, and put its baseline where
 *   the DOM puts the bottom of its line box;
 * - the card budgeted no caption, so a captioned project's card came out larger
 *   and lower than the composition's.
 */

import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { fitCardToCanvas } from "@/application/layout/canvas-fit";
import { watermarkPlacement } from "@/application/layout/watermark-placement";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

/** JetBrains Mono's own vertical metrics: ascent 1.02, descent 0.3, no line gap. */
const METRICS = { ascent: 1.02, descent: 0.3 };

const INPUT: FrameSceneInput = {
	canvasWidth: 1920,
	canvasHeight: 1080,
	plan: { frames: [{ lineCount: 2, tokens: [{ col: 0, content: "const" }] }] },
	theme: {
		background: "#0d1117",
		foreground: "#e6edf3",
		fontFamily: "JetBrains Mono, monospace",
		fontSize: 14,
		borderRadius: 12,
	},
	title: "demo.ts",
	chrome: "macos",
	background: "#101014",
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
	scale: 2.2,
	canvasMargin: 0.05,
	grain: null,
};

/**
 * Where Chromium puts a baseline below its line box's top: half the leading,
 * floored to a whole pixel, then the ascent (measured in the document).
 */
function cssBaselineOffset(lineHeight: number, fontSize: number): number {
	const ascent = METRICS.ascent * fontSize;
	const descent = METRICS.descent * fontSize;
	return Math.floor((lineHeight - ascent - descent) / 2) + ascent;
}

const STATE = {
	tokens: [{ key: "k", content: "const", line: 1, col: 0, opacity: 1 }],
	lineCount: 2,
	lineNumberCount: 2,
	timeSeconds: 0,
};

describe("glyph baseline", () => {
	it("puts a token's baseline where CSS puts it in its line box", () => {
		const scene = frameScene(INPUT);
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintFrame(ctx, scene, STATE);

		const { code } = scene;
		const baseline = code.y + code.lineHeight + cssBaselineOffset(code.lineHeight, code.fontSize);
		expect(ctx.commands).toContain(`fillText("const",${round(code.x)},${round(baseline)})`);
		expect(ctx.commands).not.toContain("textBaseline=middle");
	});

	it("puts the gutter labels on the same baseline as the code beside them", () => {
		const scene = frameScene(INPUT);
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintFrame(ctx, scene, STATE);

		const { code } = scene;
		const baseline = code.y + cssBaselineOffset(code.lineHeight, code.fontSize);
		expect(ctx.commands).toContain(
			`fillText("01",${round(scene.gutter?.textRight ?? 0)},${round(baseline)})`,
		);
	});

	it("falls back to the em box's middle on a context with no font metrics", () => {
		const scene = frameScene(INPUT);
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, STATE);

		const { code } = scene;
		expect(ctx.commands).toContain(
			`fillText("const",${round(code.x)},${round(code.y + 1.5 * code.lineHeight)})`,
		);
		expect(ctx.commands).toContain("textBaseline=middle");
	});
});

describe("watermark", () => {
	it("is one table, scaled by the tier like the card", () => {
		expect(watermarkPlacement(2.2)).toEqual({ right: 56, bottom: 48, fontSize: 22 });
		const at4k = watermarkPlacement(4.4);
		expect(at4k.right).toBeCloseTo(112, 9);
		expect(at4k.bottom).toBeCloseTo(96, 9);
		expect(at4k.fontSize).toBeCloseTo(44, 9);
	});

	it("grows with the tier on the painted canvas too", () => {
		const scene = frameScene({
			...INPUT,
			canvasWidth: 3840,
			canvasHeight: 2160,
			scale: 4.4,
			watermark: { text: "@me", color: "#ffffff" },
		});
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, STATE);
		expect(ctx.commands.some((c) => c.startsWith("font=44px"))).toBe(true);
		expect(ctx.commands).toContain(`fillText("@me",${round(3840 - 112)},${round(2160 - 96)})`);
	});

	it("lifts its baseline off the inset by the descent, where CSS puts the line box's bottom", () => {
		const scene = frameScene({ ...INPUT, watermark: { text: "@me", color: "#ffffff" } });
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintFrame(ctx, scene, STATE);
		expect(ctx.commands).toContain(
			`fillText("@me",${round(1920 - 56)},${round(1080 - 48 - 22 * METRICS.descent)})`,
		);
	});
});

describe("caption budget", () => {
	it("sizes the card on the window plus the caption block, as the composition does", () => {
		const withCaption = frameScene({ ...INPUT, hasCaption: true });
		const fit = fitCardToCanvas({
			plan: INPUT.plan,
			chrome: INPUT.chrome,
			fontSize: INPUT.theme.fontSize,
			padding: INPUT.padding,
			cardMargin: INPUT.cardMargin,
			showLineNumbers: INPUT.showLineNumbers,
			lineNumberStart: INPUT.lineNumberStart,
			hasCaption: true,
			scale: INPUT.scale,
			canvasWidth: INPUT.canvasWidth,
			canvasHeight: INPUT.canvasHeight,
			canvasMargin: INPUT.canvasMargin,
			charWidthRatio: INPUT.charWidthRatio,
		});
		expect(withCaption.card.scale).toBeCloseTo(fit.scale, 9);
		expect(withCaption.card.height).toBeCloseTo(fit.natural.height + 2 * 32 * 2.2, 6);
	});

	it("keeps the window its own height, at the top of the window and caption unit", () => {
		const without = frameScene(INPUT);
		const withCaption = frameScene({ ...INPUT, hasCaption: true });
		expect(withCaption.window.height).toBeCloseTo(without.window.height, 6);
		// The unit is centred on the canvas, so the window sits half a caption higher.
		const windowCentre = (scene: typeof without) =>
			scene.card.originY + (scene.window.y + scene.window.height / 2) * scene.card.scale;
		const captionBlock = (14 + 2 * 20) * 2.2;
		expect(windowCentre(withCaption)).toBeCloseTo(
			1080 / 2 - (captionBlock * withCaption.card.scale) / 2,
			6,
		);
	});
});
