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
import type { LayeredFrame } from "@/application/frame-painter/layers";
import type { PaintImage } from "@/application/frame-painter/paint-context";
import {
	type BackdropImage,
	type FrameSceneInput,
	type GrainTile,
	frameScene,
} from "@/application/frame-painter/scene";
import { BASE_VIDEO_SCALE, CANVAS_MARGIN, renderScaleFor } from "@/application/layout/canvas-fit";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import type { ClientExportComposition, ClientExportJob } from "./client-export-job";

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
		// An empty spotlight is no spotlight: `undefined`, not an empty set, or
		// the engine would dim every line at once.
		focusSets: job.focus.map((lines) => (lines.length > 0 ? new Set(lines) : undefined)),
	});
}

/** The layers of each frame, and how many frames the compiled timeline runs. */
export interface CompositionPlan {
	totalFrames: number;
	layersAt(frame: number): Omit<LayeredFrame, "scratch">;
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
		layersAt: (frame) =>
			layeredFrameAt(composition.document, timeline.frameAt(frame), images, output.width),
	};
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
