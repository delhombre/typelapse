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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Null when the body is readable; otherwise the reason, worded for the 400. */
export function renderRequestProblem(body: unknown): string | null {
	if (!isRecord(body)) {
		return "Request body must be a JSON object";
	}
	const { steps, theme } = body;
	if (!Array.isArray(steps) || steps.length < 2) {
		return "At least 2 steps required";
	}
	if (steps.length > MAX_STEPS) {
		return `Too many steps (max ${MAX_STEPS})`;
	}
	let totalCode = 0;
	for (const step of steps) {
		if (!isRecord(step) || typeof step.code !== "string") {
			return "Each step needs its code as a string";
		}
		if (step.code.length > MAX_STEP_CODE_CHARS) {
			return `A step's code is too long (max ${MAX_STEP_CODE_CHARS} characters)`;
		}
		totalCode += step.code.length;
	}
	if (totalCode > MAX_TOTAL_CODE_CHARS) {
		return `The steps' code is too long in total (max ${MAX_TOTAL_CODE_CHARS} characters)`;
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
