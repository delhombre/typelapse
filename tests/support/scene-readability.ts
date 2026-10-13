import {
	BASE_VIDEO_SCALE,
	CANVAS_MARGIN,
	type PlanExtent,
	fitCardToCanvas,
	renderScaleFor,
} from "@/application/layout/canvas-fit";
import { displayWidth } from "@/application/text/display-width";

/**
 * How big the code of a scene plan lands in the exported frame: pure, read-only.
 *
 * One card serves every scene (the morph needs it), so the tallest scene and the
 * longest line set the size of all of them. This asks `fitCardToCanvas`, the
 * single fit the composition, the painter and the preview all call, what that
 * size is, so a plan can be held to a readability floor before anything is
 * drawn. It restates no fit math: it only builds the plan extent the fit reads.
 */

/**
 * The smallest code a scene may land at in a 1080p frame (scaled with the tier,
 * like the 8 px `MIN_TEXT_PX` floor under it): readable on a phone, where the
 * fit-to-tallest of an unbounded scene used to leave about 9 px.
 */
export const MIN_READABLE_CODE_PX = 18;

/**
 * The look a diff import builds (`projectFromSnapshots`): the midnight theme's
 * 14 px type, macOS chrome with line numbers on, and JetBrains Mono's advance.
 */
const DIFF_IMPORT_CARD = {
	chrome: "macos",
	fontSize: 14,
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
} as const;

export interface SceneMeasure {
	/** Lines of every scene, in order. */
	lineCounts: readonly number[];
	/** The widest line of any scene, in monospace display cells. */
	longestLine: number;
}

export interface EffectiveCodePxInput extends SceneMeasure {
	canvas: { width: number; height: number };
	/** Every scene's caption (blank for none), which the card budgets a band for. */
	captions?: readonly string[];
}

/** Line counts and the longest line, read off the code of each scene. */
export function measureScenes(codes: readonly string[]): SceneMeasure {
	const lineCounts = codes.map((code) => code.split("\n").length);
	let longestLine = 0;
	for (const code of codes) {
		for (const line of code.split("\n")) {
			longestLine = Math.max(longestLine, displayWidth(line));
		}
	}
	return { lineCounts, longestLine };
}

/** The extent `fitCardToCanvas` reads: each scene's rows, one token as wide as the longest line. */
function extentOf({ lineCounts, longestLine }: SceneMeasure): PlanExtent {
	return {
		frames: lineCounts.map((lineCount, index) => ({
			lineCount,
			tokens: index === 0 ? [{ col: 0, content: "x".repeat(longestLine) }] : [],
		})),
	};
}

/**
 * The code size, in px of the exported frame, that a scene plan is drawn at on
 * `canvas`: the card's type size times the fit that squeezes its tallest scene
 * and longest line into the safe area (never under the shared floor).
 */
export function effectiveCodePx(input: EffectiveCodePxInput): number {
	const { width, height } = input.canvas;
	const unit = renderScaleFor(width, height, BASE_VIDEO_SCALE);
	const fit = fitCardToCanvas({
		plan: extentOf(input),
		...DIFF_IMPORT_CARD,
		captions: input.captions ?? [],
		scale: unit,
		canvasWidth: width,
		canvasHeight: height,
		canvasMargin: CANVAS_MARGIN,
	});
	return DIFF_IMPORT_CARD.fontSize * unit * fit.scale;
}
