/**
 * The painter's text and image layers (ticket #93): the same scene compiler the
 * DOM preview and the Remotion composition read, turned into canvas commands.
 *
 * Every expectation here is restated from the DOM: `MultimediaTextLayerContent`
 * (a centred flex box, pre-wrap, line height 1.08, tracking -0.035em) and the
 * media layer (an overflow-hidden, border-radius box holding the fitted image).
 */

import { layeredFrameAt } from "@/application/frame-painter/composition";
import { type PaintLayer, paintLayers, wrapLines } from "@/application/frame-painter/layers";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { fitMediaToBox, projectFittedMediaRect } from "@/application/layout/media-fit";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { primaryCodeOpacity } from "@/application/render/composition-slots";
import { projectTextLayerVisual } from "@/application/render/scene-layer-visuals";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

const METRICS = { ascent: 0.9, descent: 0.25 };

const TEXT_VISUAL = projectTextLayerVisual({
	typography: {
		fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
		fontSize: 100,
		fontWeight: 650,
		color: "#fffaf0",
		align: "center",
	},
});

function textLayer(overrides: Partial<Extract<PaintLayer, { kind: "text" }>> = {}): PaintLayer {
	return {
		kind: "text",
		box: { x: 100, y: 200, width: 1000, height: 400 },
		opacity: 1,
		text: "Hello",
		visual: TEXT_VISUAL,
		...overrides,
	};
}

describe("text layers", () => {
	it("sets the weight, the size and the tracking the DOM box sets", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer()], 1);

		expect(ctx.commands).toContain("font=650 100px Geist, ui-sans-serif, system-ui, sans-serif");
		// -0.035em of a 100px face, as a length a context accepts.
		expect(ctx.commands).toContain("letterSpacing=-3.5px");
		expect(ctx.commands).toContain("fillStyle=#fffaf0");
	});

	it("clips to its box, as the DOM's overflow: hidden does", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer()], 1);

		const clip = ctx.commands.indexOf("clip");
		expect(ctx.commands[clip - 1]).toBe("rect(100,200,1000,400)");
		expect(clip).toBeLessThan(ctx.commands.findIndex((c) => c.startsWith("fillText")));
	});

	it("centres one line in the box on the baseline CSS gives it", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer()], 1);

		// Line box 108px tall, centred in 400: top at 346. CSS puts the baseline at
		// half the leading, floored to a pixel, plus the ascent: floor(-3.5) + 90.
		const lineTop = 200 + (400 - 108) / 2;
		const baseline = lineTop - 4 + 90;
		// "Hello" is 5 glyphs of 60px less 3.5px of tracking each: 282.5px wide.
		const width = 5 * (60 - 3.5);
		expect(ctx.commands).toContain(
			`fillText("Hello",${round(100 + (1000 - width) / 2)},${round(baseline)})`,
		);
		expect(ctx.commands).toContain("textBaseline=alphabetic");
	});

	it("aligns each line to its own edge for left and right", () => {
		const left = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(left, [textLayer({ visual: { ...TEXT_VISUAL, textAlign: "left" } })], 1);
		expect(left.commands.some((c) => c.startsWith('fillText("Hello",100,'))).toBe(true);

		const right = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(right, [textLayer({ visual: { ...TEXT_VISUAL, textAlign: "right" } })], 1);
		const width = 5 * (60 - 3.5);
		expect(
			right.commands.some((c) => c.startsWith(`fillText("Hello",${round(1100 - width)},`)),
		).toBe(true);
	});

	it("wraps at word boundaries and keeps the author's line breaks", () => {
		const ctx = new RecordingContext();
		ctx.font = "100px Geist";
		ctx.letterSpacing = "-3.5px";
		// Each glyph is 56.5px: "Ship it" is 395.5px, "Ship it today" 734.5px.
		expect(wrapLines(ctx, "Ship it today", 500)).toEqual(["Ship it", "today"]);
		expect(wrapLines(ctx, "One\nTwo", 5000)).toEqual(["One", "Two"]);
		// A word wider than the box overflows rather than breaking inside it, as
		// `overflow-wrap: normal` does.
		expect(wrapLines(ctx, "Unbreakable", 100)).toEqual(["Unbreakable"]);
	});

	it("stacks wrapped lines one line height apart, the block centred", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer({ text: "One\nTwo" })], 1);

		const blockTop = 200 + (400 - 2 * 108) / 2;
		const first = blockTop - 4 + 90;
		const ys = ctx.commands
			.filter((c) => c.startsWith("fillText"))
			.map((c) => Number(c.slice(c.lastIndexOf(",") + 1, -1)));
		expect(ys).toEqual([round(first), round(first + 108)]);
	});

	it("carries the layer's opacity", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer({ opacity: 0.4 })], 1);
		expect(ctx.commands).toContain("globalAlpha=0.4");
	});

	it("draws in project canvas units, scaled to the export canvas", () => {
		const ctx = new RecordingContext({ fontMetrics: METRICS });
		paintLayers(ctx, [textLayer()], 0.5);
		expect(ctx.commands).toContain("scale(0.5,0.5)");
	});
});

describe("image layers", () => {
	const image = { label: "photo" };
	const layer: PaintLayer = {
		kind: "image",
		box: { x: 960, y: 120, width: 800, height: 600 },
		opacity: 1,
		radius: 48,
		image,
		media: { x: -200, y: 0, width: 1200, height: 600 },
	};

	it("clips to its rounded box and draws the fitted image inside it", () => {
		const ctx = new RecordingContext();
		paintLayers(ctx, [layer], 1);

		const clip = ctx.commands.indexOf("clip");
		expect(ctx.commands[clip - 1]).toBe("roundRect(960,120,800,600,48)");
		expect(ctx.commands).toContain("drawImage(photo:760,120,1200,600)");
		expect(clip).toBeLessThan(ctx.commands.indexOf("drawImage(photo:760,120,1200,600)"));
	});

	it("carries the layer's opacity and skips one that has faded out", () => {
		const half = new RecordingContext();
		paintLayers(half, [{ ...layer, opacity: 0.5 }], 1);
		expect(half.commands).toContain("globalAlpha=0.5");

		const gone = new RecordingContext();
		paintLayers(gone, [{ ...layer, opacity: 0 }], 1);
		expect(gone.commands.some((c) => c.startsWith("drawImage"))).toBe(false);
	});
});

const IMAGE_ASSET = {
	id: "asset-photo",
	kind: "image" as const,
	fileName: "photo.png",
	mimeType: "image/png",
	byteSize: 1024,
	checksum: "a".repeat(64),
	width: 1600,
	height: 900,
};

function primaryCode(id: string, opacity = 1) {
	return {
		id,
		kind: "code" as const,
		code: "const a = 1;",
		language: "typescript",
		themeName: "midnight",
		chrome: "macos" as const,
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		continuityKey: "primary-code",
		opacity,
		placement: { x: 0, y: 0, width: 1, height: 1 },
	};
}

function title(id: string, text: string, y: number) {
	return {
		id,
		kind: "text" as const,
		text,
		opacity: 1,
		placement: { x: 0.1, y, width: 0.8, height: 0.2 },
		typography: {
			fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
			fontSize: 88,
			fontWeight: 650,
			color: "#fffaf0",
			align: "center" as const,
		},
	};
}

/** The proof project: a title card, an image beside the code, then code alone. */
const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "proof",
		title: "Proof",
		canvas: { width: 1920, height: 1080, background: "#101014" },
		settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
		assets: [IMAGE_ASSET],
		audioCues: [],
		scenes: [
			{
				id: "title",
				durationMs: 1000,
				transitionOut: { kind: "magic-move", durationMs: 650 },
				blocks: [
					primaryCode("title::code", 0),
					title("headline", "Ship it", 0.3),
					title("byline", "in one take", 0.5),
				],
			},
			{
				id: "image",
				durationMs: 1000,
				transitionOut: { kind: "magic-move", durationMs: 650 },
				blocks: [
					{
						id: "photo",
						kind: "image",
						assetId: "asset-photo",
						fit: "cover",
						focalPoint: { x: 0.8, y: 0.5 },
						borderRadius: 40,
						opacity: 1,
						placement: { x: 0.55, y: 0.15, width: 0.4, height: 0.7 },
					},
					primaryCode("image::code"),
				],
			},
			{ id: "code", durationMs: 1000, blocks: [primaryCode("code::code")] },
		],
	},
};

describe("layeredFrameAt", () => {
	const timeline = compileSceneTimeline({ document: DOCUMENT, fps: 60 });
	const images = new Map([["asset-photo", { label: "photo" }]]);

	it("puts the title card's text over the code and hides the code it set to zero", () => {
		const frame = layeredFrameAt(DOCUMENT, timeline.frameAt(0), images, 1920);
		expect(frame.codeOpacity).toBe(0);
		expect(frame.under).toEqual([]);
		expect(frame.over.map((layer) => layer.kind)).toEqual(["text", "text"]);
		expect(frame.over[0]).toMatchObject({
			text: "Ship it",
			box: { x: 192, y: 324, width: 1536, height: 216 },
		});
		expect(frame.surfaceScale).toBe(1);
	});

	it("puts a layer authored before the code under the card, with the shared media fit", () => {
		const frame = layeredFrameAt(
			DOCUMENT,
			timeline.frameAt(Math.round(1.65 * 60) + 30),
			images,
			1920,
		);
		expect(frame.codeOpacity).toBe(1);
		expect(frame.over).toEqual([]);
		const [photo] = frame.under;
		const box = { x: 0.55 * 1920, y: 0.15 * 1080, width: 0.4 * 1920, height: 0.7 * 1080 };
		const fit = fitMediaToBox({
			source: { width: 1600, height: 900 },
			box: { x: 0, y: 0, width: box.width, height: box.height },
			fit: "cover",
			focalPoint: { x: 0.8, y: 0.5 },
		});
		expect(photo).toMatchObject({
			kind: "image",
			radius: 40,
			image: { label: "photo" },
			media: projectFittedMediaRect({
				intrinsic: { width: 1600, height: 900 },
				fit,
				container: { x: 0, y: 0 },
			}),
		});
		expect(photo?.box.x).toBeCloseTo(box.x, 6);
		expect(photo?.box.width).toBeCloseTo(box.width, 6);
	});

	it("crossfades both scenes' layers and the code through a transition", () => {
		// Halfway through the first transition, eased.
		const frame = layeredFrameAt(DOCUMENT, timeline.frameAt(Math.round(1.325 * 60)), images, 1920);
		const [headline] = frame.over;
		const [photo] = frame.under;
		expect(headline?.opacity).toBeGreaterThan(0);
		expect(headline?.opacity).toBeLessThan(1);
		expect((headline?.opacity ?? 0) + (photo?.opacity ?? 0)).toBeCloseTo(1, 6);
		// The code fades in from the title card's zero as the photo does.
		expect(frame.codeOpacity).toBeCloseTo(photo?.opacity ?? -1, 6);
	});

	it("scales the project canvas to the export canvas", () => {
		const frame = layeredFrameAt(DOCUMENT, timeline.frameAt(0), images, 960);
		expect(frame.surfaceScale).toBe(0.5);
	});

	it("draws an image whose bytes it was not given as nothing", () => {
		const frame = layeredFrameAt(
			DOCUMENT,
			timeline.frameAt(Math.round(1.65 * 60) + 30),
			new Map(),
			1920,
		);
		expect(frame.under).toEqual([]);
	});
});

const SCENE_INPUT: FrameSceneInput = {
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
	showLineNumbers: false,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
	scale: 2.2,
	canvasMargin: 0.05,
	grain: null,
};

const STATE = {
	tokens: [{ key: "k", content: "const", line: 0, col: 0, opacity: 1 }],
	lineCount: 2,
	lineNumberCount: 2,
	timeSeconds: 0,
};

describe("z-order with the code card", () => {
	const under = textLayer({ text: "UNDER" });
	const over = textLayer({ text: "OVER" });

	it("paints background, layers under, the card, layers over, in that order", () => {
		const ctx = new RecordingContext();
		paintFrame(ctx, frameScene(SCENE_INPUT), STATE, {
			surfaceScale: 1,
			under: [under],
			over: [over],
			codeOpacity: 1,
		});
		const at = (needle: string) => ctx.commands.findIndex((c) => c.includes(needle));
		expect(at("fillRect(0,0,1920,1080)")).toBeLessThan(at('fillText("UNDER"'));
		expect(at('fillText("UNDER"')).toBeLessThan(at('fillText("const"'));
		expect(at('fillText("const"')).toBeLessThan(at('fillText("OVER"'));
	});

	it("leaves the card out entirely when the scene hides the code", () => {
		const ctx = new RecordingContext();
		paintFrame(ctx, frameScene(SCENE_INPUT), STATE, {
			surfaceScale: 1,
			under: [],
			over: [over],
			codeOpacity: 0,
		});
		expect(ctx.commands.some((c) => c.includes('fillText("const"'))).toBe(false);
		expect(ctx.commands.some((c) => c.includes('fillText("OVER"'))).toBe(true);
	});

	it("composites a half-visible card as one group, through the scratch surface", () => {
		const ctx = new RecordingContext();
		const scratch = new RecordingContext();
		const scratchImage = { label: "scratch" };
		paintFrame(ctx, frameScene(SCENE_INPUT), STATE, {
			surfaceScale: 1,
			under: [],
			over: [],
			codeOpacity: 0.5,
			scratch: { ctx: scratch, image: scratchImage },
		});
		// The card went to the scratch surface, cleared first, at full strength...
		expect(scratch.commands[0]).toBe("clearRect(0,0,1920,1080)");
		expect(scratch.commands.some((c) => c.includes('fillText("const"'))).toBe(true);
		expect(scratch.commands).not.toContain("globalAlpha=0.5");
		// ...and came back as one image at half strength, like CSS group opacity.
		const draw = ctx.commands.indexOf("drawImage(scratch:0,0,1920,1080)");
		expect(draw).toBeGreaterThan(0);
		expect(ctx.commands[draw - 1]).toBe("globalAlpha=0.5");
		expect(ctx.commands.some((c) => c.includes('fillText("const"'))).toBe(false);
	});
});

describe("primaryCodeOpacity", () => {
	const timeline = compileSceneTimeline({ document: DOCUMENT, fps: 60 });

	it("is the crossfade of the two scenes' own card opacities, as the preview reads it", () => {
		expect(primaryCodeOpacity(timeline.frameAt(0))).toBe(0);
		expect(primaryCodeOpacity(timeline.frameAt(Math.round(2.15 * 60)))).toBe(1);
		const mid = primaryCodeOpacity(timeline.frameAt(Math.round(1.325 * 60)));
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
	});

	it("shows the card when no scene carries one", () => {
		expect(primaryCodeOpacity({ scenes: [], layers: [] })).toBe(1);
	});
});
