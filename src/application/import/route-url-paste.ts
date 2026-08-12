/**
 * Which control finishes a paste dropped into the studio's "Import from URL".
 *
 * That popover recognises more than it can finish. A pull request is not a file
 * but a walkthrough, and it is the one kind with a question still open: play the
 * whole change, or a chapter per commit. The diff dialog sitting beside it is
 * the control that asks that question, so a PR is handed across rather than
 * refused by a control that had just proved it recognised the URL.
 *
 * Kept here, pure and beside {@link classifySource}, because it is a policy and
 * not a rendering concern: the popover reads the answer, it does not decide it.
 */

import { classifySource } from "./classify-source";

/** Hand to the diff dialog, open here, or say this is not a link we can open. */
export type UrlPasteRoute = "hand-off" | "open-here" | "refuse";

export function routeUrlPaste(input: string): UrlPasteRoute {
	switch (classifySource(input)) {
		case "pr":
			return "hand-off";
		// No play mode to choose, so this control finishes them itself, along the
		// one import path the hero and the diff dialog also walk.
		case "commit":
		case "code-url":
			return "open-here";
		// A raw diff, a stray paste, an empty field: not a link. A single-line
		// input would have flattened a diff into an unusable one anyway.
		default:
			return "refuse";
	}
}
