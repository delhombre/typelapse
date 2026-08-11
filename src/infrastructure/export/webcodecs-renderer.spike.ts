/**
 * SPIKE — does a magic-move video need a server at all?
 *
 * Everything Typelapse exports today goes through Remotion in a headless Chrome
 * we have to run and pay for. The browser already has a hardware H.264 encoder
 * (WebCodecs) and the animation is already a pure function of time, so the only
 * missing piece was a renderer that can paint a frame without a DOM. That is
 * `application/frame-painter`; this file is the impure shell around it: probe
 * the encoder, decode the grain, walk the timeline, mux, download.
 *
 * Deliberately out of scope tonight: WebM and GIF, workers (this blocks the main
 * thread), audio, captions, watermark, reels progress, focus zoom, typewriter.
 * It renders exactly one morph, at one size, to prove the path exists.
 */

import { GRAIN_OPACITY, GRAIN_TILE_SIZE, GRAIN_TILE_URL } from "@/application/backgrounds/grain";
import { canvasFont } from "@/application/frame-painter/font";
import { paintFrame } from "@/application/frame-painter/painter";
import { type GrainTile, type SceneTheme, frameScene } from "@/application/frame-painter/scene";
import type { ChromeVariant } from "@/application/layout/frame-metrics";
import type { MagicMovePlan, RenderToken } from "@/application/magic-move/engine";
import { easeInOutCubic, renderStatic, renderTransition } from "@/application/magic-move/engine";
import { TRANSITION_MS, buildTimeline, locate } from "@/application/magic-move/timeline";
import { BrowserDownloadAdapter } from "@/infrastructure/export/browser-download.adapter";
import {
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	QUALITY_HIGH,
	canEncodeVideo,
} from "mediabunny";

/** The spike's fixed target: 3 seconds of 720p at 30 fps. */
export const SPIKE_WIDTH = 1280;
export const SPIKE_HEIGHT = 720;
export const SPIKE_FPS = 30;
export const SPIKE_DURATION_S = 3;
const SPIKE_FRAMES = SPIKE_FPS * SPIKE_DURATION_S;

/** The composition's own constants, mirrored so the spike lands where it does. */
const VIDEO_SCALE = 2.2;
const CANVAS_MARGIN = 0.05;

export interface SpikeInput {
	plan: MagicMovePlan;
	theme: SceneTheme;
	title: string;
	background: string;
	chrome: ChromeVariant;
	padding: number;
	cardMargin: number;
	showLineNumbers: boolean;
	lineNumberStart: number;
}

export interface SpikeMeasurements {
	/** Wall-clock time spent painting every frame, in ms. */
	paintMs: number;
	/** Wall-clock time spent encoding and muxing, in ms. */
	encodeMs: number;
	totalMs: number;
	bytes: number;
	frames: number;
	/** The advance the resolved font actually reports, ÷ font size. */
	charWidthRatio: number;
	codec: string;
}

export interface SpikeResult {
	blob: Blob;
	measurements: SpikeMeasurements;
}

/** Why the browser cannot do this here, in words a UI can show. */
export class SpikeUnsupportedError extends Error {}

/**
 * Render the first morph of a plan to an MP4, entirely in this tab.
 *
 * Nothing is streamed: the whole file is muxed into memory and handed back as a
 * blob. At 3 seconds that is trivial; it is one of the things a real
 * implementation would have to revisit.
 */
export async function renderSpikeMp4(input: SpikeInput): Promise<SpikeResult> {
	if (input.plan.frames.length < 2 || !input.plan.transitions[0]) {
		throw new SpikeUnsupportedError("The spike needs two steps to morph between.");
	}
	const codec = await probeEncoder();

	const canvas = document.createElement("canvas");
	// H.264 wants even dimensions on both axes; 1280×720 already is, but the
	// guard belongs here rather than in a comment.
	canvas.width = even(SPIKE_WIDTH);
	canvas.height = even(SPIKE_HEIGHT);
	const ctx = canvas.getContext("2d", { alpha: false });
	if (!ctx) {
		throw new SpikeUnsupportedError("This browser gave us no 2D context to paint into.");
	}

	const charWidthRatio = await measureAdvance(ctx, input.theme);
	const scene = frameScene({
		canvasWidth: canvas.width,
		canvasHeight: canvas.height,
		plan: input.plan,
		theme: input.theme,
		title: input.title,
		chrome: input.chrome,
		background: input.background,
		padding: input.padding,
		cardMargin: input.cardMargin,
		showLineNumbers: input.showLineNumbers,
		lineNumberStart: input.lineNumberStart,
		charWidthRatio,
		scale: VIDEO_SCALE,
		canvasMargin: CANVAS_MARGIN,
		grain: await decodeGrain(),
	});

	const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
	const source = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_HIGH });
	output.addVideoTrack(source, { frameRate: SPIKE_FPS });
	await output.start();

	const started = performance.now();
	let paintMs = 0;
	for (let i = 0; i < SPIKE_FRAMES; i++) {
		const seconds = i / SPIKE_FPS;
		const beforePaint = performance.now();
		paintFrame(ctx, scene, {
			...viewAt(input.plan, seconds),
			lineNumberCount: gutterRows(input.plan),
			timeSeconds: seconds,
		});
		paintMs += performance.now() - beforePaint;
		await source.add(seconds, 1 / SPIKE_FPS);
	}
	await output.finalize();

	const buffer = output.target.buffer;
	if (!buffer) {
		throw new SpikeUnsupportedError("The muxer finalized without producing a buffer.");
	}
	const blob = new Blob([buffer], { type: "video/mp4" });
	const totalMs = performance.now() - started;

	return {
		blob,
		measurements: {
			paintMs,
			encodeMs: totalMs - paintMs,
			totalMs,
			bytes: blob.size,
			frames: SPIKE_FRAMES,
			charWidthRatio,
			codec,
		},
	};
}

/** Render the spike and hand the file to the browser's own download path. */
export async function downloadSpikeMp4(input: SpikeInput): Promise<SpikeMeasurements> {
	const { blob, measurements } = await renderSpikeMp4(input);
	await new BrowserDownloadAdapter().export(blob, "spike", "mp4");
	return measurements;
}

/**
 * The spike's timeline: hold, morph, hold, filling the fixed three seconds with
 * the app's own transition tempo. `buildTimeline` and `locate` are the exact
 * functions the preview's playback loop calls, so a frame here and a scrub
 * there resolve to the same phase and the same normalized `t`.
 */
export function spikeTimeline() {
	const hold = (SPIKE_DURATION_S * 1000 - TRANSITION_MS) / 2;
	return buildTimeline([hold, hold], TRANSITION_MS);
}

/**
 * What to paint at a given instant: the engine's tokens and the row count the
 * code area is clipped to. Both come from the same three functions the preview's
 * `resolveView` calls, in the same order, so a frame here is the frame there.
 */
export function viewAt(
	plan: MagicMovePlan,
	seconds: number,
): { tokens: RenderToken[]; lineCount: number } {
	const position = locate(spikeTimeline(), seconds * 1000);
	const transition = plan.transitions[0];
	const from = plan.frames[0];
	const to = plan.frames[1];
	if (position.phase === "transition" && transition && from && to) {
		// The body height eases on easeInOutCubic while the tokens move on the
		// engine's own curve: the preview's asymmetry, kept.
		const eased = easeInOutCubic(position.t);
		return {
			tokens: renderTransition(transition.from, transition.to, position.t),
			lineCount: from.lineCount + (to.lineCount - from.lineCount) * eased,
		};
	}
	const frame = plan.frames[Math.min(position.index, 1)];
	if (!frame) {
		return { tokens: [], lineCount: 1 };
	}
	return { tokens: renderStatic(frame.tokens), lineCount: frame.lineCount };
}

/** A gutter tall enough for both frames, so it never flickers mid-morph. */
function gutterRows(plan: MagicMovePlan): number {
	return Math.max(plan.frames[0]?.lineCount ?? 1, plan.frames[1]?.lineCount ?? 1);
}

/**
 * Ask WebCodecs directly before handing anything to the muxer, so an
 * unsupported browser produces one clear sentence instead of a failure three
 * layers down.
 */
async function probeEncoder(): Promise<string> {
	if (typeof VideoEncoder === "undefined") {
		throw new SpikeUnsupportedError(
			"This browser has no WebCodecs VideoEncoder; a client-side export is impossible here.",
		);
	}
	// Baseline level 3.1 covers 1280×720 at 30 fps and is the most widely
	// supported profile; the muxer negotiates the final string itself.
	const codec = "avc1.42001f";
	const support = await VideoEncoder.isConfigSupported({
		codec,
		width: even(SPIKE_WIDTH),
		height: even(SPIKE_HEIGHT),
		framerate: SPIKE_FPS,
	});
	if (!support.supported) {
		throw new SpikeUnsupportedError(
			`This browser refused H.264 at ${SPIKE_WIDTH}×${SPIKE_HEIGHT}; the server render is still the only path here.`,
		);
	}
	if (!(await canEncodeVideo("avc", { width: even(SPIKE_WIDTH), height: even(SPIKE_HEIGHT) }))) {
		throw new SpikeUnsupportedError("The muxer found no usable H.264 encoder in this browser.");
	}
	return codec;
}

/**
 * The advance of the font the browser *actually* resolved.
 *
 * The theme asks for a family that may well not be installed, and the preview
 * lays its tokens out in `ch` of whatever it fell back to. Measuring rather
 * than assuming is what keeps a painted glyph on the preview's column when the
 * fallback differs from machine to machine.
 */
async function measureAdvance(ctx: CanvasRenderingContext2D, theme: SceneTheme): Promise<number> {
	const size = theme.fontSize * VIDEO_SCALE;
	const font = canvasFont(size, theme.fontFamily);
	try {
		await document.fonts.load(font, "0");
	} catch {
		// A family the document does not know is not an error: the fallback is
		// exactly what the preview would use too.
	}
	ctx.font = font;
	return ctx.measureText("0").width / size;
}

/** Decode the shared grain tile once, ready to be tiled by the painter. */
async function decodeGrain(): Promise<GrainTile | null> {
	try {
		const image = new Image();
		image.src = GRAIN_TILE_URL;
		await image.decode();
		return { image, size: GRAIN_TILE_SIZE, opacity: GRAIN_OPACITY };
	} catch {
		// The grain is texture, not information: a frame without it is still a
		// frame, so this must never be what fails an export.
		return null;
	}
}

function even(value: number): number {
	return value % 2 === 0 ? value : value - 1;
}
