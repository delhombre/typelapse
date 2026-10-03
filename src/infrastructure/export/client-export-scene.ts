/**
 * A job, turned into the two things that actually render it: the fixed geometry
 * (`frameScene`) and the walk over time (`videoScript`).
 *
 * The worker and the main thread both need this, and they must not each grow
 * their own version of it — the whole point of the client export is that one
 * picture comes out of three surfaces.
 */

import { type VideoScript, videoScript } from "@/application/export/video-script";
import {
	type BackdropImage,
	type FrameSceneInput,
	type GrainTile,
	frameScene,
} from "@/application/frame-painter/scene";
import { BASE_VIDEO_SCALE, CANVAS_MARGIN, renderScaleFor } from "@/application/layout/canvas-fit";
import type { ClientExportJob } from "./client-export-job";

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
