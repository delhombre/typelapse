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
 * The composition's own constants. They are mirrored rather than imported
 * because `server/remotion/composition.tsx` is a server module; when the two
 * paths are finally merged this is the pair that has to move.
 */
export const VIDEO_SCALE = 2.2;
export const CANVAS_MARGIN = 0.05;

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
		scale: VIDEO_SCALE,
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
