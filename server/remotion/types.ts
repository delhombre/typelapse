/** Shared types between the server and the Remotion composition. */

import type { MagicMovePlan } from "../../src/application/magic-move/engine";
import type { CubicBezier } from "../../src/application/magic-move/easing";
import type { RenderFormat } from "../../src/domain/entities/render-config";
import type { WindowChrome } from "../../src/presentation/components/preview/frame-chrome";
import type { ProgressStyle } from "../../src/presentation/components/preview/reels-progress";

export interface StepData {
	code: string;
	duration: number; // ms
	/** 1-indexed line numbers to spotlight for this step; others dim. Missing = no focus. */
	focus?: number[];
	/** Caption shown beneath the frame during this step. Missing = none. */
	caption?: string;
}

export interface ThemeData {
	name: string;
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	borderRadius: number;
}

export interface RenderInput {
	title: string;
	language: string;
	theme: ThemeData;
	steps: StepData[];
	background: string;
	/** Window chrome variant drawn atop the code frame. */
	windowChrome: WindowChrome;
	/** Show the line-number gutter. */
	showLineNumbers: boolean;
	/** First gutter number (display-only; focus stays relative to line 1). */
	lineNumberStart: number;
	framePadding: number;
	/** Mesh gap (px, unscaled) between the window edge and the card edge, matching
	 *  the preview's cardMargin so the exported video keeps the same proportion. */
	cardMargin: number;
	/** Laid-out magic-move frames + transitions, precomputed server-side. */
	plan: MagicMovePlan;
	/** Morph duration between steps, in milliseconds. */
	transitionMs: number;
	/** CSS-compatible curve used by positional morphs, frame size and focus zoom. */
	transitionEasing: CubicBezier;
	/** Append a transition from the last step back to the first for seamless looping. */
	loop: boolean;
	/** Type the first step out character by character before the animation. */
	typewriter: boolean;
	/** Cinematic push-in toward each step's spotlighted lines. */
	focusZoom: boolean;
	/** Progress indicator style baked over the video. */
	progressStyle: ProgressStyle;
	/** Optional watermark text overlay. */
	watermark?: string;
	/**
	 * Synthesized tick track as a WAV data URL, mounted at frame 0. Built in the
	 * render route from the same timeline numbers as the preview. Absent = silent
	 * (e.g. GIF, or the sound toggle off).
	 */
	audioDataUrl?: string;
}

/**
 * The exact JSON body the client POSTs to /api/render. Typing BOTH the client
 * that builds it (the export store) and the server that parses it (the render
 * route) against this one shape makes any client/server drift a compile error.
 * It is a type-only contract: the route still clamps and whitelists every field
 * at runtime, since the body is untrusted.
 */
export interface RenderRequestBody {
	title: string;
	language: string;
	theme: ThemeData;
	steps: StepData[];
	background: string;
	windowChrome: WindowChrome;
	showLineNumbers: boolean;
	lineNumberStart: number;
	framePadding: number;
	cardMargin: number;
	width: number;
	height: number;
	fps: number;
	format: RenderFormat;
	loop: boolean;
	typewriter: boolean;
	focusZoom: boolean;
	sound: boolean;
	progressStyle: ProgressStyle;
	transitionMs: number;
	transitionEasing: CubicBezier;
	watermark?: string;
}
