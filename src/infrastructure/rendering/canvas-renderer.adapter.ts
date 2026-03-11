import type { RenderConfig } from "@/domain/entities/render-config";
import type { Snippet } from "@/domain/entities/snippet";

export interface ExportProgress {
	phase: "capturing" | "rendering" | "encoding";
	current: number;
	total: number;
}

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Browser-based video renderer.
 *
 * Pipeline:
 * 1. Capture each step frame as a PNG from a DOM element
 * 2. Draw cross-fade transitions between frames on an OffscreenCanvas
 * 3. Record the canvas stream as WebM via MediaRecorder
 */
export class CanvasRendererAdapter {
	/**
	 * Render a video from pre-captured step frame images.
	 * Uses canvas + MediaRecorder for browser-native WebM output.
	 */
	async renderVideo(
		frameImages: HTMLImageElement[],
		snippet: Snippet,
		config: RenderConfig,
		onProgress?: ProgressCallback,
	): Promise<Blob> {
		if (frameImages.length < 2) {
			throw new Error("At least 2 step frames required for video export");
		}

		const canvas = document.createElement("canvas");
		canvas.width = config.width;
		canvas.height = config.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Canvas 2D context not available");
		}

		// Set up MediaRecorder
		const stream = canvas.captureStream(config.fps);
		const mimeType = getSupportedMimeType();
		const recorder = new MediaRecorder(stream, {
			mimeType,
			videoBitsPerSecond: 8_000_000,
		});

		const chunks: Blob[] = [];
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				chunks.push(e.data);
			}
		};

		const recordingDone = new Promise<Blob>((resolve) => {
			recorder.onstop = () => {
				resolve(new Blob(chunks, { type: mimeType }));
			};
		});

		recorder.start();

		const transitionDurationMs = 600;
		const totalTransitions = frameImages.length - 1;
		const frameDurationMs = 1000 / config.fps;

		for (let i = 0; i < frameImages.length; i++) {
			const img = frameImages[i];
			if (!img) {
				continue;
			}

			onProgress?.({
				phase: "rendering",
				current: i + 1,
				total: frameImages.length,
			});

			// Hold on this step
			const step = snippet.steps[i];
			const holdMs = step?.duration ?? 1000;
			const holdFrames = Math.round(holdMs / frameDurationMs);

			for (let f = 0; f < holdFrames; f++) {
				drawImageScaled(ctx, img, config.width, config.height);
				await waitOneFrame(frameDurationMs);
			}

			// Cross-fade transition to next step
			if (i < totalTransitions) {
				const nextImg = frameImages[i + 1];
				if (!nextImg) {
					continue;
				}

				const transitionFrames = Math.round(transitionDurationMs / frameDurationMs);
				for (let f = 0; f < transitionFrames; f++) {
					const t = f / transitionFrames;
					const eased = easeInOutCubic(t);

					ctx.clearRect(0, 0, config.width, config.height);

					// Outgoing frame
					ctx.globalAlpha = 1 - eased;
					drawImageScaled(ctx, img, config.width, config.height);

					// Incoming frame
					ctx.globalAlpha = eased;
					drawImageScaled(ctx, nextImg, config.width, config.height);

					ctx.globalAlpha = 1;
					await waitOneFrame(frameDurationMs);
				}
			}
		}

		recorder.stop();

		onProgress?.({
			phase: "encoding",
			current: 1,
			total: 1,
		});

		return recordingDone;
	}
}

function drawImageScaled(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	canvasW: number,
	canvasH: number,
) {
	// Scale image to fit canvas while maintaining aspect ratio, centered
	const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
	const w = img.naturalWidth * scale;
	const h = img.naturalHeight * scale;
	const x = (canvasW - w) / 2;
	const y = (canvasH - h) / 2;

	ctx.clearRect(0, 0, canvasW, canvasH);
	ctx.drawImage(img, x, y, w, h);
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function waitOneFrame(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function getSupportedMimeType(): string {
	const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
	for (const type of types) {
		if (MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}
	return "video/webm";
}
