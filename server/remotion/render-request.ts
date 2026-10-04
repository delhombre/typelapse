/**
 * Shape check for the untrusted `POST /api/render` body, before anything reads it.
 *
 * The route clamps every number it renders with, but it used to destructure the
 * body on trust: an empty or non-JSON body, `null`, a `steps` string, a missing
 * theme or a missing title each threw a TypeError and came back as a 500, the
 * last one only after a full render. This module answers the one question the
 * route needs first, "is this a body I can read", with a message a 400 can carry.
 *
 * It also closes two holes the clamps could not see:
 *  - Theme colours are painted as raw CSS on the card, so `url(http://...)` in
 *    `theme.background` or `theme.foreground` made headless Chrome fetch it
 *    (measured: a local listener got the hit). Every theme the studio ships is
 *    a hex colour, so only hex is accepted.
 *  - Step code had no ceiling under the 8 MB body limit. A 2 MB step crashed
 *    Chrome after 17 s and a 500 KB one timed out after 80 s; 100 KB rendered in
 *    13 s. The caps below sit under that, and far above what a frame can show.
 */

import type { WindowChrome } from "../../src/presentation/components/preview/frame-chrome";
import type { ProgressStyle } from "../../src/presentation/components/preview/reels-progress";

export const MAX_STEPS = 50;
/** About a thousand lines of ordinary code: more than any frame can make legible. */
export const MAX_STEP_CODE_CHARS = 50_000;
export const MAX_TOTAL_CODE_CHARS = 250_000;

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function count(value: number): string {
	return value.toLocaleString("en-US");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Null when the body is readable; otherwise the reason, worded for the 400. */
export function renderRequestProblem(body: unknown): string | null {
	if (!isRecord(body)) {
		return "Request body must be a JSON object";
	}
	const { steps, theme } = body;
	// One scene is a video (decision D3 of the 2026-10-03 sprint).
	if (!Array.isArray(steps) || steps.length < 1) {
		return "At least 1 step required";
	}
	if (steps.length > MAX_STEPS) {
		return `Too many steps (max ${MAX_STEPS})`;
	}
	let totalCode = 0;
	for (const [index, step] of steps.entries()) {
		if (!isRecord(step) || typeof step.code !== "string") {
			return "Each step needs its code as a string";
		}
		// The studio shows these two sentences as they are, next to the offer to
		// render on the device instead (#113), so they name the scene and both sizes.
		if (step.code.length > MAX_STEP_CODE_CHARS) {
			const limit = count(MAX_STEP_CODE_CHARS);
			const size = `${count(step.code.length)} characters, over the limit of ${limit}`;
			return `Scene ${index + 1}'s code is too long for the server: ${size}.`;
		}
		totalCode += step.code.length;
	}
	if (totalCode > MAX_TOTAL_CODE_CHARS) {
		const size = `${count(totalCode)} characters, over the limit of ${count(MAX_TOTAL_CODE_CHARS)}`;
		return `The scenes' code is too long in total for the server: ${size}.`;
	}
	if (!isRecord(theme) || typeof theme.name !== "string" || typeof theme.fontFamily !== "string") {
		return "A theme with a name and a font family is required";
	}
	if (
		typeof theme.background !== "string" ||
		!HEX_COLOR.test(theme.background) ||
		typeof theme.foreground !== "string" ||
		!HEX_COLOR.test(theme.foreground)
	) {
		return "Theme colours must be hex colours";
	}
	return null;
}

/* The composition indexes a table by these two strings; an unknown chrome threw
   "reading 'padY'" inside Chrome as a 500. Typed against the unions, so a typo
   or a removed variant here is a compile error. */
const WINDOW_CHROMES = [
	"macos",
	"browser",
	"terminal",
	"none",
] as const satisfies readonly WindowChrome[];
const PROGRESS_STYLES = ["reels", "bar", "none"] as const satisfies readonly ProgressStyle[];

export function windowChromeOf(value: unknown): WindowChrome {
	return WINDOW_CHROMES.find((chrome) => chrome === value) ?? "macos";
}

export function progressStyleOf(value: unknown): ProgressStyle {
	return PROGRESS_STYLES.find((style) => style === value) ?? "reels";
}
