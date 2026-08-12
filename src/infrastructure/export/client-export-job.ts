/**
 * The wire between the tab and the worker that does the rendering.
 *
 * Everything here has to survive `structuredClone`, which rules out class
 * instances, functions and closures — so the job is the plan (already plain
 * data), the export's settings, and the look, flattened. `Set` clones fine, but
 * the spotlights travel as arrays anyway: they are easier to read in a log and
 * the worker has to widen them into sets exactly once either way.
 */

import type { SceneProgress, SceneTheme, SceneWatermark } from "@/application/frame-painter/scene";
import type { ChromeVariant } from "@/application/layout/frame-metrics";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import type { RenderFormat } from "@/domain/entities/render-config";

export interface ClientExportJob {
	plan: MagicMovePlan;
	/** Hold duration of each step, in milliseconds. */
	durations: number[];
	/** The first step's source, which the typewriter reveals a prefix of. */
	firstCode: string;
	/** Per-step spotlight as 1-indexed line numbers; an empty array is no spotlight. */
	focus: number[][];

	width: number;
	height: number;
	fps: number;
	format: RenderFormat;
	transitionMs: number;
	loop: boolean;
	typewriter: boolean;
	focusZoom: boolean;

	theme: SceneTheme;
	title: string;
	background: string;
	chrome: ChromeVariant;
	padding: number;
	cardMargin: number;
	showLineNumbers: boolean;
	lineNumberStart: number;
	progress: SceneProgress | null;
	watermark: SceneWatermark | null;

	/**
	 * The advance the *document* resolved, for drift reporting only. The worker
	 * paints on the advance it measures itself, because glyphs have to land on
	 * the grid the font in the worker actually draws; this is how we find out
	 * when the two contexts disagree instead of shipping a video that is subtly
	 * off the preview.
	 */
	documentCharWidthRatio: number;
}

export interface ClientExportMeasurements {
	/** Wall-clock time spent painting every frame, in ms. */
	paintMs: number;
	/** Wall-clock time spent encoding and muxing, in ms. */
	encodeMs: number;
	totalMs: number;
	bytes: number;
	frames: number;
	/** The advance the worker's own resolved font reports, ÷ font size. */
	charWidthRatio: number;
	/** How far that is from the document's: the WYSIWYG canary. */
	charWidthDrift: number;
	codec: string;
}

export type ClientExportEvent =
	| { type: "progress"; completedFrames: number; totalFrames: number }
	| {
			type: "done";
			buffer: ArrayBuffer;
			mime: string;
			measurements: ClientExportMeasurements;
	  }
	| { type: "failed"; message: string };

/** Why the browser cannot do this here, in words a UI can show. */
export class ClientExportUnsupportedError extends Error {}
