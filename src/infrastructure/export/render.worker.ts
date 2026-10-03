/// <reference lib="webworker" />

/**
 * The renderer, off the main thread.
 *
 * The spike painted and encoded in the tab, and the tab froze for the whole
 * render — which is exactly the experience a client-side export exists to
 * avoid. Everything expensive lives here now: an `OffscreenCanvas`, the pure
 * painter, and mediabunny's muxer. The tab keeps its frames and gets progress.
 *
 * The sharpest lesson from the spike survives the move and gets sharper. The
 * advance of a monospace glyph is not a constant — it is whatever font the
 * *context* resolved — and a worker resolves fonts in its own scope, not the
 * document's. So the fonts this app ships are loaded again in here, the advance
 * is measured again in here, and the difference from the document's is reported
 * rather than assumed away.
 */

import { GRAIN_OPACITY, GRAIN_TILE_SIZE, GRAIN_TILE_URL } from "@/application/backgrounds/grain";
import { transparencyPlan, wantsTransparency } from "@/application/export/transparency";
import { advanceDriftMessage } from "@/application/fonts/font-fidelity";
import { paintFrame } from "@/application/frame-painter/painter";
import type { GrainTile } from "@/application/frame-painter/scene";
import { measureCharWidthRatio } from "@/application/layout/char-advance";
import { CHROME_FONT_STACK } from "@/application/layout/frame-metrics";
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from "mediabunny";
import { decodeBackdropImage } from "./backdrop-image";
import type { ClientExportEvent, ClientExportJob } from "./client-export-job";
import { compositionPlanFor, sceneFor, scriptFor, textFontStacks } from "./client-export-scene";
import { firstEncodableRung, qualityOf } from "./codec-probe";
import { encodeGif } from "./gif-encoder";
import { gifDimensions } from "./gif-quality";
import { gifSafeFps } from "./gif-timing";
import { type CodecRung, encodingFor, evenDimensions } from "./video-encoding";
import { loadExportFonts } from "./worker-fonts";

/** Report progress this often. Every frame would cost more than it tells. */
const PROGRESS_EVERY = 5;

const scope = self as unknown as DedicatedWorkerGlobalScope & { fonts?: FontFaceSet };

scope.onmessage = (event: MessageEvent<ClientExportJob>) => {
	void run(event.data).catch((error: unknown) => {
		post({ type: "failed", message: describe(error) });
	});
};

async function run(job: ClientExportJob): Promise<void> {
	const started = performance.now();
	const encoding = encodingFor(job.format, job.width, job.height, job.fps);
	// A GIF is a loop in a README, not a deliverable at 1080p: the long edge
	// comes down before anything is painted, so the card fit-scales into the
	// smaller canvas rather than being resampled after the fact.
	const { width, height } =
		encoding.container === "gif"
			? gifDimensions(job.width, job.height)
			: evenDimensions(job.width, job.height);

	// Which codec this browser will actually give us, decided before anything is
	// painted so a refusal costs one sentence rather than a render.
	//
	// A transparent export asks the ladder twice: first for a rung that will
	// carry the alpha channel, and then — when none will — for the best rung
	// regardless, with the plan below saying what the file lost. The order
	// matters. Asking the other way round would pick AV1, discover it drops
	// alpha, and flatten a background VP9 could have kept.
	const alphaRung = wantsTransparency(job.background)
		? await firstEncodableRung(encoding.ladder, { width, height, fps: job.fps, alpha: "keep" })
		: null;
	const rung =
		alphaRung ?? (await firstEncodableRung(encoding.ladder, { width, height, fps: job.fps }));
	if (encoding.ladder.length > 0 && !rung) {
		throw new Error(
			typeof VideoEncoder === "undefined"
				? "This browser has no WebCodecs VideoEncoder."
				: `This browser refused every ${encoding.container.toUpperCase()} codec at ${width}×${height} at ${job.fps} fps.`,
		);
	}

	// A background of `None` needs a canvas that can actually hold nothing, and
	// everything else is better off without one: on an opaque context a GIF's
	// pixel read-back is a copy rather than a composite. What the file can carry
	// decides, so the encoder is asked before the canvas is made.
	const transparency = transparencyPlan({
		format: job.format,
		background: job.background,
		encoderKeepsAlpha: alphaRung !== null,
	});

	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { alpha: transparency.keepAlpha });
	if (!ctx) {
		throw new Error("This browser gave the worker no 2D context to paint into.");
	}

	// GIF spends whole centisecondes per frame, so it cannot hold 60: asking for
	// what the format can deliver is what keeps the duration exact.
	const fps = encoding.container === "gif" ? gifSafeFps(job.fps) : job.fps;

	const charWidthRatio = await measureAdvance(
		ctx,
		job.theme.fontFamily,
		job.theme.fontSize,
		job.composition ? textFontStacks(job.composition.document) : [],
	);
	// The net under the font loading: two scopes that resolved the same family to
	// different metrics would put the video out of line with the preview, and a
	// video that is quietly off is worse than an export that says why it stopped.
	const drift = advanceDriftMessage(
		charWidthRatio,
		job.documentCharWidthRatio,
		job.theme.fontFamily,
	);
	if (drift) {
		throw new Error(drift);
	}

	const scene = sceneFor({ ...job, width, height }, charWidthRatio, {
		grain: await decodeGrain(),
		backdropImage: await decodeBackdropImage(job.background),
	});
	const codeScript = scriptFor({ ...job, fps });
	// A studio project's text and image layers come from the scene compiler the
	// preview reads, at the file's own rate. Its timeline can outrun the code's
	// (an audio cue past the last scene), and the code then holds its last frame.
	const composition = job.composition
		? compositionPlanFor(job.composition, { width, fps, loop: job.loop })
		: null;
	const script = composition
		? { ...codeScript, totalFrames: Math.max(codeScript.totalFrames, composition.totalFrames) }
		: codeScript;
	// Where a translucent card is painted whole before it is faded as one picture.
	const scratchCanvas = composition ? new OffscreenCanvas(width, height) : null;
	const scratchCtx = scratchCanvas?.getContext("2d") ?? null;
	const scratch =
		scratchCanvas && scratchCtx ? { ctx: scratchCtx, image: scratchCanvas } : undefined;

	const painter = (frame: number) => {
		paintFrame(
			ctx,
			scene,
			codeScript.frameAt(frame),
			composition ? { ...composition.layersAt(frame), scratch } : undefined,
		);
	};

	const result =
		encoding.container === "gif"
			? await encodeGif({
					canvas,
					ctx,
					script,
					fps,
					paint: painter,
					report,
					transparent: transparency.keepAlpha,
				})
			: await encodeVideo({
					canvas,
					script,
					fps,
					container: encoding.container,
					rung,
					paint: painter,
					alpha: transparency.encodeAlpha,
				});

	post(
		{
			type: "done",
			buffer: result.buffer,
			mime: encoding.mime,
			measurements: {
				paintMs: result.paintMs,
				encodeMs: performance.now() - started - result.paintMs,
				totalMs: performance.now() - started,
				bytes: result.buffer.byteLength,
				frames: script.totalFrames,
				charWidthRatio,
				charWidthDrift: Math.abs(charWidthRatio - job.documentCharWidthRatio),
				codec: result.codec,
				codecLabel: rung?.label ?? null,
				chroma: rung?.chroma ?? null,
				transparency: transparency.outcome,
				transparencyNote: transparency.note,
			},
		},
		[result.buffer],
	);
}

interface EncodeInput {
	canvas: OffscreenCanvas;
	script: ReturnType<typeof scriptFor>;
	fps: number;
	container: "mp4" | "webm" | "gif";
	/** The rung the probe settled on. Null only where there is no encoder at all. */
	rung: CodecRung | null;
	paint: (frame: number) => void;
	/** Carry the canvas's alpha into the packets, where the codec can. */
	alpha: boolean;
}

/** The rung the probe chose, through WebCodecs, muxed by mediabunny. */
async function encodeVideo(
	input: EncodeInput,
): Promise<{ buffer: ArrayBuffer; paintMs: number; codec: string }> {
	const { canvas, script, fps, container, rung, paint, alpha } = input;
	if (!rung) {
		throw new Error(`No client-side encoder for ${container}.`);
	}

	const output = new Output({
		format: container === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(),
		target: new BufferTarget(),
	});
	// What the encoder is actually handed, reported rather than assumed. The
	// string is pinned by `fullCodecString` — left to itself mediabunny builds
	// one from the codec name, which would quietly drop AV1 back to Profile 0 and
	// give away the 4:4:4 chroma the whole ladder exists for — and this callback
	// is how we find out if that ever stops being true.
	let encoded: string | null = null;
	const source = new CanvasSource(canvas, {
		codec: rung.codec,
		fullCodecString: rung.codecString,
		// A quantizer where the browser honours one (VP9), a budget where it does
		// not. Passing both lets mediabunny offer constant quality first and fall
		// back to the budget on a build that refuses it.
		bitrate: qualityOf(rung, { width: canvas.width, height: canvas.height, fps }),
		onEncoderConfig: (config) => {
			encoded = config.codec;
		},
		// Discard by default: an opaque canvas has nothing to carry, and asking
		// for alpha the format cannot hold costs bytes for a channel of ones.
		alpha: alpha ? "keep" : "discard",
	});
	output.addVideoTrack(source, { frameRate: fps });
	await output.start();

	let paintMs = 0;
	for (let frame = 0; frame < script.totalFrames; frame++) {
		const before = performance.now();
		paint(frame);
		paintMs += performance.now() - before;
		// Awaiting each frame respects the encoder's backpressure: without it a
		// long video queues every frame at once and the worker runs out of memory
		// before it runs out of timeline.
		await source.add(frame / fps, 1 / fps);
		report(frame + 1, script.totalFrames);
	}
	await output.finalize();

	const buffer = output.target.buffer;
	if (!buffer) {
		throw new Error("The muxer finalized without producing a buffer.");
	}
	return { buffer, paintMs, codec: encoded ?? rung.codecString };
}

/**
 * The advance of the font *this scope* resolved.
 *
 * Measured at the size the frames are painted at, because a hinted font's
 * advance is not perfectly linear in size, and the canvas that lays out the
 * grid has to be the one that answers.
 *
 * The load in front of it is what makes the number mean anything: without it
 * this measured a fallback and reported it as the truth.
 */
async function measureAdvance(
	ctx: OffscreenCanvasRenderingContext2D,
	fontFamily: string,
	fontSize: number,
	textStacks: string[],
): Promise<number> {
	// The chrome bar is set in the app's own mono whatever the code is set in, so
	// it is a second family this scope has to have before it paints anything; a
	// text layer's face (Geist) is a third. FontFace works in a Chromium worker,
	// so the faces are loaded here rather than pre-rasterized in the tab: text
	// rasterized at one size and scaled would not be the preview's glyphs.
	await loadExportFonts(scope.fonts, fontFamily, CHROME_FONT_STACK, ...textStacks);
	// The same probe the document and the server take, at the same size, so the
	// three answers are comparable and the card is sized on this scope's glyphs.
	return measureCharWidthRatio(ctx, fontFamily, fontSize);
}

/** Decode the shared grain tile once, ready to be tiled by the painter. */
async function decodeGrain(): Promise<GrainTile | null> {
	try {
		const response = await fetch(GRAIN_TILE_URL);
		const image = await createImageBitmap(await response.blob());
		return { image, size: GRAIN_TILE_SIZE, opacity: GRAIN_OPACITY };
	} catch {
		// The grain is texture, not information: a frame without it is still a
		// frame, so this must never be what fails an export.
		return null;
	}
}

function report(completedFrames: number, totalFrames: number): void {
	if (completedFrames % PROGRESS_EVERY === 0 || completedFrames === totalFrames) {
		post({ type: "progress", completedFrames, totalFrames });
	}
}

function post(event: ClientExportEvent, transfer: Transferable[] = []): void {
	scope.postMessage(event, transfer);
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : "The render failed in the worker.";
}
