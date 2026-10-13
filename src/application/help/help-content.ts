import { focusLineSet, parseLineRanges } from "@/application/focus/line-ranges";

/**
 * What the Help sheet says, as data the sheet and its tests both read.
 *
 * Plain sentences only: nothing in the sheet lives in a tooltip or a title, so a
 * phone, a screen reader and a keyboard all get the same words.
 */

/** How scenes work, in three lines. */
export const SCENE_LINES = [
	"A scene is one step of the video: a piece of code, how long it holds before it morphs, and an optional caption.",
	"Between two scenes the code morphs: shared tokens glide to their new place, removed ones fade out, and new ones appear.",
	"Add a scene by capturing the editor's code, or from a source such as a pull request or a diff. The video plays them in order, and the first scene can type itself out.",
] as const;

/** The focus field's example, exactly as a person types it into "Focus lines". */
export const FOCUS_EXAMPLE = "2-4, 7";

export const FOCUS_INTRO =
	"Focus keeps some lines of a scene bright and dims the rest. Type line numbers or ranges, separated by commas, in the Focus lines field of a scene.";

/** The lines the example lights, read from the same parser the field uses. */
export function focusExampleLines(): number[] {
	const ranges = parseLineRanges(FOCUS_EXAMPLE);
	if (ranges === null || ranges.length === 0) {
		return [];
	}
	const last = Math.max(...ranges.map((range) => range.endLine));
	return [...focusLineSet(ranges, last)].sort((a, b) => a - b);
}

/** "2, 3, 4 and 7": a list of numbers as a person says it. */
export function sayLines(lines: readonly number[]): string {
	if (lines.length <= 1) {
		return lines.join("");
	}
	return `${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;
}

/** What the example means, as the end of the sentence that starts with it. */
export function focusExampleMeaning(): string {
	return `keeps lines ${sayLines(focusExampleLines())} bright.`;
}

/**
 * Where the docs are: the landing's How it works section. There is no docs site,
 * and `docs/` in the repository is the team's own notes. A plain address, not a
 * route: a fragment on another route scrolls reliably only on a full navigation.
 */
export const DOCS_HREF = "/#how-it-works";
export const DOCS_LABEL = "How it works";
