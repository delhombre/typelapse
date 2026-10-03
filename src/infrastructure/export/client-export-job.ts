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
import type { CubicBezier } from "@/application/magic-move/easing";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { RenderFormat } from "@/domain/entities/render-config";

/** One decoded image a layer shows, transferred to the worker rather than copied. */
export interface ClientExportImage {
	assetId: string;
	bitmap: ImageBitmap;
}

/**
 * One video a layer shows, as its file. A `Blob` clones by reference, so the
 * bytes are not copied; the worker demuxes and decodes them itself.
 */
export interface ClientExportVideo {
	assetId: string;
	blob: Blob;
}

/**
 * A studio project's layers: the V2 document the scene compiler reads (plain
 * data, it clones), the images its layers show, decoded in the tab from the
 * local asset store, and the files of its videos. The document never carries
 * bytes; the bitmaps and blobs do.
 */
export interface ClientExportComposition {
	document: ProjectDocumentV2;
	images: ClientExportImage[];
	videos: ClientExportVideo[];
}

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
	transitionEasing: CubicBezier;
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
	/** Whether any scene has a caption, which the card budgets room for. */
	hasCaption?: boolean;
	/** The text and image layers around the card; absent for code alone. */
	composition?: ClientExportComposition | null;

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
	/** The codec string the encoder was actually configured with. */
	codec: string;
	/**
	 * What that rung is called out loud — "AV1 4:4:4", "VP9", "H.264".
	 *
	 * WebM's codec is a ladder, and a ladder that falls back silently is a ladder
	 * that lies: a file the user believes is AV1 and is really VP8 is a different
	 * file. Null only where nothing was encoded (GIF).
	 */
	codecLabel: string | null;
	/** What the file's chroma planes actually are, which is where text lives or dies. */
	chroma: "4:4:4" | "4:2:0" | null;
	/** What became of a background of `None` in this container. */
	transparency: "opaque" | "carried" | "flattened";
	/** What the finished file is not, having been asked for; null when it is. */
	transparencyNote: string | null;
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
