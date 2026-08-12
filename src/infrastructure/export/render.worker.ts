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
import { transparencyPlan } from "@/application/export/transparency";
import { advanceDriftMessage } from "@/application/fonts/font-fidelity";
import { canvasFont } from "@/application/frame-painter/font";
import { paintFrame } from "@/application/frame-painter/painter";
import type { GrainTile } from "@/application/frame-painter/scene";
import { CHROME_FONT_STACK } from "@/application/layout/frame-metrics";
import {
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	QUALITY_HIGH,
	WebMOutputFormat,
	canEncodeVideo,
} from "mediabunny";
import { decodeBackdropImage } from "./backdrop-image";
import type { ClientExportEvent, ClientExportJob } from "./client-export-job";
import { VIDEO_SCALE, sceneFor, scriptFor } from "./client-export-scene";
import { encodeGif } from "./gif-encoder";
import { gifDimensions } from "./gif-quality";
import { gifSafeFps } from "./gif-timing";
import { encodingFor, evenDimensions } from "./video-encoding";
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

	// A background of `None` needs a canvas that can actually hold nothing, and
	// everything else is better off without one: on an opaque context a GIF's
	// pixel read-back is a copy rather than a composite. What the file can carry
	// decides, so the encoder is asked before the canvas is made.
	const transparency = transparencyPlan({
		format: job.format,
		background: job.background,
		encoderKeepsAlpha: await encoderKeepsAlpha(encoding, width, height, job.fps),
	});

	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { alpha: transparency.keepAlpha });
	if (!ctx) {
		throw new Error("This browser gave the worker no 2D context to paint into.");
	}

	// GIF spends whole centisecondes per frame, so it cannot hold 60: asking for
	// what the format can deliver is what keeps the duration exact.
	const fps = encoding.container === "gif" ? gifSafeFps(job.fps) : job.fps;

	const charWidthRatio = await measureAdvance(ctx, job.theme.fontFamily, job.theme.fontSize);
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
	const script = scriptFor({ ...job, fps });

	const painter = (frame: number) => {
		paintFrame(ctx, scene, script.frameAt(frame));
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
					encoding,
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
	encoding: ReturnType<typeof encodingFor>;
	paint: (frame: number) => void;
	/** Carry the canvas's alpha into the packets, where the codec can. */
	alpha: boolean;
}

/**
 * Whether this browser will encode alpha for the codec at hand.
 *
 * Asked rather than assumed: VP9 is specified to carry alpha as packet side
 * data, and whether a given build actually does is a property of the machine.
 */
async function encoderKeepsAlpha(
	encoding: ReturnType<typeof encodingFor>,
	width: number,
	height: number,
	fps: number,
): Promise<boolean> {
	if (!encoding.codec || typeof VideoEncoder === "undefined") {
		return false;
	}
	for (const codec of encoding.probeCodecs) {
		try {
			const support = await VideoEncoder.isConfigSupported({
				codec,
				width,
				height,
				framerate: fps,
				alpha: "keep",
			});
			if (support.supported) {
				return true;
			}
		} catch {
			// A build that will not even consider the configuration is a no.
		}
	}
	return false;
}

/** H.264 or VP9 through WebCodecs, muxed by mediabunny. */
async function encodeVideo(
	input: EncodeInput,
): Promise<{ buffer: ArrayBuffer; paintMs: number; codec: string }> {
	const { canvas, script, fps, encoding, paint, alpha } = input;
	if (!encoding.codec) {
		throw new Error(`No client-side encoder for ${encoding.container}.`);
	}
	const codec = await probe(encoding, canvas.width, canvas.height, fps);

	const output = new Output({
		format: encoding.container === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(),
		target: new BufferTarget(),
	});
	const source = new CanvasSource(canvas, {
		codec: encoding.codec,
		bitrate: QUALITY_HIGH,
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
	return { buffer, paintMs, codec };
}

/**
 * Ask WebCodecs before handing anything to the muxer, so an unsupported
 * configuration produces one clear sentence rather than a failure three layers
 * down. Each candidate profile is tried in turn: baseline is the safest ask,
 * but it thins out above 1080p where high is what hardware actually implements.
 */
async function probe(
	encoding: ReturnType<typeof encodingFor>,
	width: number,
	height: number,
	fps: number,
): Promise<string> {
	if (typeof VideoEncoder === "undefined") {
		throw new Error("This browser has no WebCodecs VideoEncoder.");
	}
	for (const codec of encoding.probeCodecs) {
		const support = await VideoEncoder.isConfigSupported({ codec, width, height, framerate: fps });
		if (support.supported) {
			return codec;
		}
	}
	if (encoding.codec && !(await canEncodeVideo(encoding.codec, { width, height }))) {
		throw new Error(`This browser has no usable ${encoding.codec.toUpperCase()} encoder.`);
	}
	throw new Error(
		`This browser refused ${encoding.container.toUpperCase()} at ${width}×${height} at ${fps} fps.`,
	);
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
): Promise<number> {
	// The chrome bar is set in the app's own mono whatever the code is set in, so
	// it is a second family this scope has to have before it paints anything.
	await loadExportFonts(scope.fonts, fontFamily, CHROME_FONT_STACK);
	const size = fontSize * VIDEO_SCALE;
	ctx.font = canvasFont(size, fontFamily);
	return ctx.measureText("0").width / size;
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
