/**
 * The Typelapse project file format.
 *
 * One shape, several producers (JSON export, share links, the template catalog)
 * and exactly ONE consumer: `useSnippetStore.importFromJson`. Declaring it here,
 * in the application layer, lets the catalog and the tests be typed against the
 * format without reaching into the presentation store.
 *
 * `importFromJson` still validates at runtime: this type describes what a WELL
 * FORMED file looks like, not a promise about the bytes on disk.
 */

import type { CubicBezier } from "@/application/magic-move/easing";

/** Window chrome drawn around the code frame. */
export type ProjectWindowChrome = "macos" | "browser" | "terminal" | "none";

/** Progress indicator baked over the video. */
export type ProjectProgressStyle = "reels" | "bar" | "none";

/** Morph tempo: how long each step-to-step transition takes, in milliseconds. */
export type ProjectTempoMs = 400 | 650 | 1000;

export interface ProjectStepPayload {
	code: string;
	/** Hold on this step, in milliseconds. */
	duration: number;
	/** Focused lines in the compact human grammar ("2-4, 7"); absent means none. */
	focus?: string;
	/** Caption shown while this step holds. */
	caption?: string;
}

export interface ProjectPayload {
	title: string;
	/** The code shown before playback: normally the first step's code. */
	code: string;
	/** Shiki language id (`typescript`, `tsx`, `diff`, `python`, …). */
	language: string;
	/** One of the built-in theme names (`midnight`, `dracula`, `nord`, …). */
	themeName: string;
	/** Optional for backwards compatibility; current saves always include both. */
	fontFamily?: string;
	borderRadius?: number;
	/** Backdrop: a mesh preset (`mesh:aurora`), a CSS gradient, or a plain colour. */
	background: string;
	steps: ProjectStepPayload[];

	windowChrome?: ProjectWindowChrome;
	showLineNumbers?: boolean;
	lineNumberStart?: number;
	/** Code padding inside the window, in px. */
	framePadding?: number;
	/** Mesh margin around the code window, in px. */
	cardMargin?: number;
	watermark?: string;

	progressStyle?: ProjectProgressStyle;
	/** Type the first step out character by character. */
	typewriter?: boolean;
	/** Cinematic push-in on the focused lines. */
	focusZoom?: boolean;
	transitionMs?: ProjectTempoMs;
	/** Global motion curve applied to every code morph. */
	transitionEasing?: CubicBezier;
	/** Export width in px. Applied only together with {@link ProjectPayload.height}. */
	width?: number;
	/** Export height in px. Applied only together with {@link ProjectPayload.width}. */
	height?: number;
}
