/** Shared types between the server and the Remotion composition. */

import type { MagicMovePlan } from "../../src/application/magic-move/engine";
import type { ProgressStyle } from "../../src/presentation/components/preview/reels-progress";

export interface StepData {
	code: string;
	duration: number; // ms
}

export interface ThemeData {
	name: string;
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	padding: number;
	borderRadius: number;
}

export interface RenderInput {
	title: string;
	language: string;
	theme: ThemeData;
	steps: StepData[];
	background: string;
	framePadding: number;
	/** Laid-out magic-move frames + transitions, precomputed server-side. */
	plan: MagicMovePlan;
	/** Morph duration between steps, in milliseconds. */
	transitionMs: number;
	/** Append a transition from the last step back to the first for seamless looping. */
	loop: boolean;
	/** Type the first step out character by character before the animation. */
	typewriter: boolean;
	/** Progress indicator style baked over the video. */
	progressStyle: ProgressStyle;
	/** Optional watermark text overlay. */
	watermark?: string;
}
