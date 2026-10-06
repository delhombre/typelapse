/**
 * The renderer, on the user's own machine.
 *
 * Every video Typelapse produces today costs us a headless Chrome. The browser
 * has had a hardware H.264 encoder for years and the animation was already a
 * pure function of time, so the only thing standing between a snippet and an
 * MP4 was a renderer that can paint a frame without a DOM. The spike proved the
 * path exists; this is the path, behind the port the app already had.
 *
 * Nothing expensive happens in here. The adapter's whole job is to say what to
 * render — measure the document's own font advance, flatten the snippet and the
 * look into one cloneable job — and then to translate a worker's messages back
 * into the port's vocabulary: progress, a blob, or one sentence about why not.
 */

import { stillFrameOf } from "@/application/export/png-snapshot";
import { wantsTransparency } from "@/application/export/transparency";
import type { VideoScript } from "@/application/export/video-script";
import { focusLineSet } from "@/application/focus/line-ranges";
import { canvasFont } from "@/application/frame-painter/font";
import type { SceneProgress, SceneWatermark } from "@/application/frame-painter/scene";
import { advanceProbeFont, measureCharWidthRatio } from "@/application/layout/char-advance";
import type { ChromeVariant } from "@/application/layout/frame-metrics";
import type { CubicBezier } from "@/application/magic-move/easing";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import { typingHoldIndex } from "@/application/magic-move/typewriter";
import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { RenderConfig, RenderFormat } from "@/domain/entities/render-config";
import type { Snippet } from "@/domain/entities/snippet";
import type {
	RenderProgress,
	RenderVideoOptions,
	RendererPort,
} from "@/domain/ports/renderer.port";
import { decodeBackdropImage } from "./backdrop-image";
import {
	type ClientExportEvent,
	type ClientExportJob,
	type ClientExportMeasurements,
	ClientExportUnsupportedError,
} from "./client-export-job";
import { openFramePainter, sceneFor, scriptFor, textFontFaces } from "./client-export-scene";
import { firstEncodableRung } from "./codec-probe";
import { decodeCompositionImages } from "./composition-images";
import { loadCompositionVideos } from "./composition-videos";
import { grainTileOf, rasterizeGrainTile } from "./grain-tile";
import { encodingFor, evenDimensions } from "./video-encoding";

/**
 * Everything about the look that is not on the snippet: the built plan, and the
 * presentation settings the panel's own switches control.
 */
export interface ClientScenery {
	plan: MagicMovePlan;
	background: string;
	chrome: ChromeVariant;
	padding: number;
	cardMargin: number;
	showLineNumbers: boolean;
	lineNumberStart: number;
	transitionMs: number;
	transitionEasing: CubicBezier;
	loop: boolean;
	typewriter: boolean;
	focusZoom: boolean;
	progress: SceneProgress | null;
	watermark: SceneWatermark | null;
	/** Whether any scene has a caption, which the card budgets room for. */
	hasCaption?: boolean;
	/**
	 * A studio project's layers: the V2 document, and the store its images' and
	 * videos' bytes are read from on this device.
	 */
	composition?: {
		document: ProjectDocumentV2;
		library: Pick<LocalProjectLibraryPort, "loadAsset">;
	} | null;
}

/**
 * Can this browser encode this format at this size, here, now?
 *
 * Asked before the panel offers the on-device path at all, so a browser without
 * WebCodecs is told once, up front, instead of at the end of a render it was
 * never going to finish. GIF is always available: it is packed by hand.
 */
export async function isClientExportSupported(
	format: RenderFormat,
	width: number,
	height: number,
	fps: number,
): Promise<boolean> {
	if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
		return false;
	}
	const { width: w, height: h } = evenDimensions(width, height);
	const encoding = encodingFor(format, w, h, fps);
	if (encoding.container === "gif") {
		return true;
	}
	// The same seam the worker uses, so the panel cannot offer a path the render
	// will then refuse: one ladder, one probe, one answer.
	return (await firstEncodableRung(encoding.ladder, { width: w, height: h, fps })) !== null;
}

export class WebCodecsRendererAdapter implements RendererPort {
	/** Filled in by the last completed render, for the panel to report. */
	lastMeasurements: ClientExportMeasurements | null = null;

	constructor(private readonly scenery: ClientScenery) {}

	/**
	 * The video's first frame, as a data URL.
	 *
	 * One frame is not worth a worker, so this paints on the main thread — and
	 * it is the one place where the *document's* font is the right one to
	 * measure, because a preview is shown next to the app.
	 */
	async renderPreview(snippet: Snippet): Promise<string> {
		const canvas = await this.paintStill(snippet, snippet.renderConfig, () => 0);
		return canvas.toDataURL("image/png");
	}

	/**
	 * One scene of the export as a PNG: the frame the video shows at the end of
	 * that scene's hold, at the config's own size.
	 *
	 * The same painter and the same script as the file, so the still is the
	 * video's frame and not a fourth rendering of it: the mesh is behind the
	 * card, the size is the preset's and not the window's, and a vertical export
	 * is vertical. A background of `None` comes back transparent.
	 */
	async renderStill(snippet: Snippet, config: RenderConfig, sceneIndex: number): Promise<Blob> {
		const canvas = await this.paintStill(snippet, config, (script) =>
			stillFrameOf(script, sceneIndex),
		);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error("This browser could not encode the PNG."));
				}
			}, "image/png");
		});
	}

	/**
	 * One frame of the export, painted on the main thread.
	 *
	 * @param frameOf Picks the frame from the script, because the preview wants
	 *   the first and a snapshot wants the end of a scene's hold.
	 */
	private async paintStill(
		snippet: Snippet,
		config: RenderConfig,
		frameOf: (script: VideoScript) => number,
	): Promise<HTMLCanvasElement> {
		const job = await this.buildJob(snippet, config);
		const { width, height } = evenDimensions(job.width, job.height);
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		// A PNG can hold an alpha channel, so unlike the video path this one never
		// has to flatten: a background of `None` comes back transparent.
		const ctx = canvas.getContext("2d", { alpha: wantsTransparency(this.scenery.background) });
		if (!ctx) {
			throw new ClientExportUnsupportedError("This browser gave us no 2D context to paint into.");
		}
		const scene = sceneFor({ ...job, width, height }, job.documentCharWidthRatio, {
			grain: grainTileOf(job.grain, "png"),
			backdropImage: await decodeBackdropImage(job.background),
		});
		if (job.composition) {
			await loadLayerFonts(job.composition.document);
		}
		const codeScript = scriptFor(job);
		const frame = frameOf(codeScript);
		const frames = await openFramePainter({
			job,
			ctx,
			scene,
			codeScript,
			width,
			height,
			fps: job.fps,
			makeScratch: (w, h) => {
				const surface = document.createElement("canvas");
				surface.width = w;
				surface.height = h;
				const surfaceCtx = surface.getContext("2d");
				return surfaceCtx ? { ctx: surfaceCtx, image: surface } : null;
			},
			only: frame,
		});
		try {
			await frames.paint(frame);
		} finally {
			frames.close();
		}
		return canvas;
	}

	async renderVideo(
		snippet: Snippet,
		config: RenderConfig,
		options?: RenderVideoOptions,
	): Promise<Blob> {
		if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
			throw new ClientExportUnsupportedError(
				"This browser cannot render off the main thread; the hosted render is the only path here.",
			);
		}
		const job = await this.buildJob(snippet, config);
		options?.onProgress?.(progressOf("preparing", 0, 1));

		return await this.runWorker(job, options);
	}

	private runWorker(job: ClientExportJob, options?: RenderVideoOptions): Promise<Blob> {
		return new Promise<Blob>((resolve, reject) => {
			const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
				type: "module",
				name: "typelapse-render",
			});

			const stop = () => {
				worker.terminate();
				options?.signal?.removeEventListener("abort", onAbort);
			};
			const onAbort = () => {
				stop();
				reject(new DOMException("The export was cancelled.", "AbortError"));
			};
			if (options?.signal?.aborted) {
				onAbort();
				return;
			}
			options?.signal?.addEventListener("abort", onAbort);

			worker.onmessage = (event: MessageEvent<ClientExportEvent>) => {
				const message = event.data;
				if (message.type === "progress") {
					options?.onProgress?.(
						progressOf("encoding", message.completedFrames, message.totalFrames),
					);
					return;
				}
				stop();
				if (message.type === "failed") {
					reject(new ClientExportUnsupportedError(message.message));
					return;
				}
				this.lastMeasurements = message.measurements;
				options?.onProgress?.(
					progressOf("finalizing", message.measurements.frames, message.measurements.frames),
				);
				resolve(new Blob([message.buffer], { type: message.mime }));
			};

			// A worker that fails to *load* never posts anything, so its own error
			// event is the only signal that the render is not coming.
			worker.onerror = (event) => {
				stop();
				reject(
					new ClientExportUnsupportedError(
						event.message || "The render worker could not be started.",
					),
				);
			};

			// The bitmaps move to the worker rather than being copied: a photo decoded
			// at its full size is the largest thing a job carries.
			const bitmaps = job.composition?.images.map((image) => image.bitmap) ?? [];
			worker.postMessage(job, job.grain ? [...bitmaps, job.grain] : bitmaps);
		});
	}

	private async buildJob(snippet: Snippet, config: RenderConfig): Promise<ClientExportJob> {
		const scenery = this.scenery;
		const typingIndex = typingHoldIndex(snippet.steps.map((step) => step.code));
		return {
			plan: scenery.plan,
			durations: snippet.steps.map((step) => step.duration),
			firstCode: snippet.steps[typingIndex]?.code ?? snippet.code,
			typingIndex,
			focus: snippet.steps.map((step) => [...focusLineSet(step.highlightRanges)]),

			width: config.width,
			height: config.height,
			fps: config.fps,
			format: config.format,
			transitionMs: scenery.transitionMs,
			transitionEasing: scenery.transitionEasing,
			loop: scenery.loop,
			typewriter: scenery.typewriter,
			focusZoom: scenery.focusZoom,

			theme: {
				background: snippet.theme.background,
				foreground: snippet.theme.foreground,
				fontFamily: snippet.theme.fontFamily,
				fontSize: snippet.theme.fontSize,
				borderRadius: snippet.theme.borderRadius,
			},
			title: snippet.title,
			background: scenery.background,
			chrome: scenery.chrome,
			padding: scenery.padding,
			cardMargin: scenery.cardMargin,
			showLineNumbers: scenery.showLineNumbers,
			lineNumberStart: scenery.lineNumberStart,
			progress: scenery.progress,
			watermark: scenery.watermark,
			hasCaption: scenery.hasCaption ?? false,
			composition: scenery.composition
				? {
						document: scenery.composition.document,
						images: await decodeCompositionImages(
							scenery.composition.document,
							scenery.composition.library,
						),
						videos: await loadCompositionVideos(
							scenery.composition.document,
							scenery.composition.library,
						),
					}
				: null,
			grain: await rasterizeGrainTile(),

			documentCharWidthRatio: await measureDocumentAdvance(
				snippet.theme.fontFamily,
				snippet.theme.fontSize,
			),
		};
	}
}

/**
 * The faces the text layers are set in, ready before they are painted.
 *
 * A canvas draws in whatever the document has loaded at that instant, and a face
 * the page has not yet used is still a fallback. The worker loads these itself;
 * on the main thread the document already knows them, and only has to be asked.
 */
async function loadLayerFonts(project: ProjectDocumentV2): Promise<void> {
	try {
		await Promise.all(
			textFontFaces(project).map(({ fontFamily, fontWeight }) =>
				document.fonts.load(canvasFont(16, fontFamily, undefined, fontWeight)),
			),
		);
	} catch {
		// A family the document does not know is not an error: the fallback is
		// exactly what the preview would use too.
	}
}

/**
 * The advance the *document* resolved, measured the way the spike learned to.
 *
 * The theme asks for a family most machines do not have, and the preview lays
 * its tokens out in `ch` of whatever it fell back to. This number is what the
 * worker's own measurement is checked against: when they disagree, the exported
 * video is off the preview, and we would rather know that than not.
 */
async function measureDocumentAdvance(fontFamily: string, fontSize: number): Promise<number> {
	try {
		await document.fonts.load(advanceProbeFont(fontFamily, fontSize), "0");
	} catch {
		// A family the document does not know is not an error: the fallback is
		// exactly what the preview would use too.
	}
	const ctx = document.createElement("canvas").getContext("2d");
	if (!ctx) {
		throw new Error("This browser gave the page no 2D context to measure the font with.");
	}
	return measureCharWidthRatio(ctx, fontFamily, fontSize);
}

function progressOf(
	phase: RenderProgress["phase"],
	completedFrames: number,
	totalFrames: number,
): RenderProgress {
	return {
		phase,
		completedFrames,
		totalFrames,
		ratio: totalFrames > 0 ? Math.min(1, completedFrames / totalFrames) : 0,
	};
}
