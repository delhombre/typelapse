/**
 * A job, turned into the two things that actually render it: the fixed geometry
 * (`frameScene`) and the walk over time (`videoScript`).
 *
 * The worker and the main thread both need this, and they must not each grow
 * their own version of it — the whole point of the client export is that one
 * picture comes out of three surfaces.
 */

import { type VideoScript, videoScript } from "@/application/export/video-script";
import { layeredFrameAt } from "@/application/frame-painter/composition";
import type { LayeredFrame, ScratchSurface } from "@/application/frame-painter/layers";
import type { PaintContext, PaintImage } from "@/application/frame-painter/paint-context";
import { paintFrame } from "@/application/frame-painter/painter";
import {
	type BackdropImage,
	type FrameScene,
	type FrameSceneInput,
	type GrainTile,
	frameScene,
} from "@/application/frame-painter/scene";
import { BASE_VIDEO_SCALE, CANVAS_MARGIN, renderScaleFor } from "@/application/layout/canvas-fit";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import type { ClientExportComposition, ClientExportJob } from "./client-export-job";
import { openCompositionVideos } from "./composition-videos";

/**
 * The decoded images a frame needs, which a job cannot carry: neither survives
 * `structuredClone`, and each surface decodes them in its own scope anyway.
 */
export interface SceneAssets {
	grain: GrainTile | null;
	backdropImage: BackdropImage | null;
}

/**
 * The shared placement table's constants, re-exported for the worker and its
 * tests. `BASE_VIDEO_SCALE` is a *base*: the scale to draw at is
 * `renderScaleFor(...)` of it, which is 2.2 only at 1080p (see `sceneInputFor`).
 */
export { BASE_VIDEO_SCALE, CANVAS_MARGIN };

export function sceneInputFor(
	job: ClientExportJob,
	charWidthRatio: number,
	assets: SceneAssets,
): FrameSceneInput {
	return {
		canvasWidth: job.width,
		canvasHeight: job.height,
		plan: job.plan,
		theme: job.theme,
		title: job.title,
		chrome: job.chrome,
		background: job.background,
		padding: job.padding,
		cardMargin: job.cardMargin,
		showLineNumbers: job.showLineNumbers,
		lineNumberStart: job.lineNumberStart,
		charWidthRatio,
		// The tier, applied — and this is the line that was missing.
		//
		// The composition draws at `renderScaleFor(...)` and so does the live
		// preview; this one drew at the flat base, and `fitScale` never enlarges.
		// So a 4K export was not a sharper video, it was the 1080p card at its
		// 1080p pixel size centred in four times the canvas: the same text
		// resolution as the 1080p file, four times the encode, and *softer* on
		// screen the moment a player fit it to the display. The two paths that
		// already had this right are why the preview and the server render did not
		// show it.
		scale: renderScaleFor(job.width, job.height, BASE_VIDEO_SCALE),
		canvasMargin: CANVAS_MARGIN,
		grain: assets.grain,
		backdropImage: assets.backdropImage,
		focusZoom: job.focusZoom,
		progress: job.progress,
		watermark: job.watermark,
		hasCaption: job.hasCaption ?? false,
	};
}

export function sceneFor(job: ClientExportJob, charWidthRatio: number, assets: SceneAssets) {
	return frameScene(sceneInputFor(job, charWidthRatio, assets));
}

export function scriptFor(job: ClientExportJob): VideoScript {
	return videoScript({
		plan: job.plan,
		durations: job.durations,
		transitionMs: job.transitionMs,
		transitionEasing: job.transitionEasing,
		fps: job.fps,
		loop: job.loop,
		typewriter: job.typewriter,
		firstCode: job.firstCode,
		typingIndex: job.typingIndex,
		// An empty spotlight is no spotlight: `undefined`, not an empty set, or
		// the engine would dim every line at once.
		focusSets: job.focus.map((lines) => (lines.length > 0 ? new Set(lines) : undefined)),
	});
}

/** One video layer's source time at one export frame. */
export interface VideoFrameRequest {
	blockId: string;
	assetId: string;
	frame: number;
	/** The source time the preview seeks its `<video>` to, in seconds. */
	seconds: number;
}

/** The layers of each frame, and how many frames the compiled timeline runs. */
export interface CompositionPlan {
	totalFrames: number;
	/** @param videoFrames This frame's decoded picture of each video layer, by block id. */
	layersAt(
		frame: number,
		videoFrames?: ReadonlyMap<string, PaintImage>,
	): Omit<LayeredFrame, "scratch">;
	/**
	 * Every video frame the first `frames` export frames show, in frame order:
	 * the whole schedule is known before the first decode, which is what lets the
	 * decoder read each packet once instead of seeking per frame. `first` starts
	 * the walk later: a still asks for its one frame without walking the rest.
	 */
	videoRequests(frames: number, first?: number): VideoFrameRequest[];
}

/**
 * The scene compiler the DOM preview and the composition read, compiled at the
 * file's own rate, with the layers of each frame laid out for the painter.
 */
export function compositionPlanFor(
	composition: ClientExportComposition,
	output: { width: number; fps: number; loop: boolean },
): CompositionPlan {
	const timeline = compileSceneTimeline({
		document: composition.document,
		fps: output.fps,
		loop: output.loop,
	});
	const images = new Map<string, PaintImage>(
		composition.images.map((image) => [image.assetId, image.bitmap]),
	);
	return {
		totalFrames: timeline.totalFrames,
		layersAt: (frame, videoFrames) =>
			layeredFrameAt(
				composition.document,
				timeline.frameAt(frame),
				images,
				output.width,
				videoFrames,
			),
		videoRequests: (frames, first = 0) => {
			const requests: VideoFrameRequest[] = [];
			for (let frame = first; frame < frames; frame++) {
				for (const layer of timeline.frameAt(frame).layers) {
					if (layer.kind === "video") {
						requests.push({
							blockId: layer.blockId,
							assetId: layer.assetId,
							frame,
							seconds: toMediaClock(layer.sourceTimeMs),
						});
					}
				}
			}
			return requests;
		},
	};
}

/**
 * Milliseconds as seconds on the browser's media clock, which counts whole
 * microseconds. `(t - sceneStart) * rate + trimIn` in floating point can land a
 * hair under a frame boundary (1.0999999 for 1.1) and pick the frame before the
 * one the preview's `<video>` shows; rounding to the microsecond, as the
 * browser does with `currentTime`, settles it the same way.
 */
function toMediaClock(ms: number): number {
	return Math.round(ms * 1_000) / 1_000_000;
}

/** Every font stack a text layer names, once each, for the worker to load. */
export function textFontStacks(document: ProjectDocumentV2): string[] {
	const stacks = new Set<string>();
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "text") {
				stacks.add(block.typography.fontFamily);
			}
		}
	}
	return [...stacks];
}

/**
 * Every (family, weight) pair a text layer paints with, once each.
 *
 * A family registers one face per weight, and a canvas draws in the faces the
 * page has loaded by then: asking for the family alone gets the regular face and
 * leaves the weight the layer actually uses to fall back.
 */
export function textFontFaces(
	document: ProjectDocumentV2,
): { fontFamily: string; fontWeight: number }[] {
	const faces = new Map<string, { fontFamily: string; fontWeight: number }>();
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "text") {
				const { fontFamily, fontWeight } = block.typography;
				faces.set(`${fontWeight} ${fontFamily}`, { fontFamily, fontWeight });
			}
		}
	}
	return [...faces.values()];
}

/** The surface a translucent card is painted whole onto before it is faded. */
export type MakeScratch = (width: number, height: number) => ScratchSurface | null;

/** What paints the frames of one export, wherever the canvas lives. */
export interface FramePainter {
	/**
	 * The script to step through: the code's, stretched to the composition's end
	 * when its timeline outruns the code (an audio cue past the last scene, where
	 * the code then holds its last frame).
	 */
	script: VideoScript;
	/** Paint one frame: the code card and, for a studio project, the layers around it. */
	paint(frame: number): Promise<void>;
	/** Release the decoders. Always called once the frames are done. */
	close(): void;
}

/**
 * The one place a frame is painted, for the video and for the PNG.
 *
 * The worker steps through every frame of this; the main thread asks it for the
 * single frame a still is cut from. Both pass through `paintFrame` with the same
 * layers for the same frame index, so a snapshot cannot disagree with the file
 * about what a studio project's text, image and video layers are doing.
 *
 * @param only A still's frame: the video layers are then decoded for that frame
 *   alone instead of for the whole schedule.
 */
export async function openFramePainter(input: {
	job: ClientExportJob;
	ctx: PaintContext;
	scene: FrameScene;
	codeScript: VideoScript;
	width: number;
	height: number;
	fps: number;
	makeScratch: MakeScratch;
	only?: number;
}): Promise<FramePainter> {
	const { job, ctx, scene, codeScript, width, height, fps } = input;
	const composition = job.composition
		? compositionPlanFor(job.composition, { width, fps, loop: job.loop })
		: null;
	if (!composition || !job.composition) {
		return {
			script: codeScript,
			paint: async (frame) => paintFrame(ctx, scene, codeScript.frameAt(frame)),
			close: () => {},
		};
	}

	const script = {
		...codeScript,
		totalFrames: Math.max(codeScript.totalFrames, composition.totalFrames),
	};
	const scratch = input.makeScratch(width, height) ?? undefined;
	// Video layers are decoded on the schedule the compiler gives every frame; a
	// codec this browser cannot decode refuses now, before frame one.
	const requests =
		input.only === undefined
			? composition.videoRequests(script.totalFrames)
			: composition.videoRequests(input.only + 1, input.only);
	const videos = await openCompositionVideos(
		job.composition.document,
		job.composition.videos,
		requests,
	);
	return {
		script,
		paint: async (frame) => {
			const videoFrames = await videos.framesAt(frame);
			paintFrame(ctx, scene, codeScript.frameAt(frame), {
				...composition.layersAt(frame, videoFrames),
				scratch,
			});
		},
		close: () => videos.close(),
	};
}
