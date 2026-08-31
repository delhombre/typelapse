import type { ProjectPayload, ProjectStepPayload } from "./project-payload";

/**
 * The authored half of a project: the snippet someone wrote and the look they
 * composed around it. Deliberately excludes the render settings (aspect, tempo,
 * typewriter, focus zoom, progress style), which are export-time choices a user
 * re-picks in two clicks rather than work they would mourn losing.
 */
export type ProjectContent = Pick<
	ProjectPayload,
	| "title"
	| "code"
	| "language"
	| "themeName"
	| "background"
	| "windowChrome"
	| "showLineNumbers"
	| "lineNumberStart"
	| "framePadding"
	| "cardMargin"
	| "watermark"
	| "steps"
> & {
	/**
	 * The theme fields the studio lets you change WITHOUT changing the theme's
	 * name. `setFont` and `setBorderRadius` rebuild the Theme in place, so
	 * `themeName` stays "midnight" while every exported frame looks different.
	 * Fingerprinting the name alone would call that "no edits" and let the
	 * template gallery overwrite it unasked.
	 *
	 * They are required in authored state even though the file format keeps them
	 * optional for backwards compatibility. Current files carry both, so local
	 * projects, JSON and share links reproduce the frame instead of merely naming
	 * its original theme.
	 */
	fontFamily: string;
	borderRadius: number;
};

/**
 * A comparable identity for authored content: two projects share a fingerprint
 * when they hold the same work, whatever order their fields were written in and
 * whether their optional fields are absent or spelled out.
 *
 * The studio uses it to answer one question honestly before a template
 * overwrites the editor: has the user authored anything since this project was
 * loaded? Comparing fingerprints, rather than counting edit events, means an
 * edit typed and then undone by hand correctly reads as "no edits" instead of
 * nagging about work that was reverted.
 */

/** Normalize the two ways "no focus" and "no caption" are spelled. */
function fingerprintStep(step: ProjectStepPayload): unknown[] {
	return [step.code, step.duration, step.focus ?? "", step.caption ?? ""];
}

/**
 * Positional by construction: the fields are listed once, in one order, so key
 * order and absent-versus-undefined can never leak into the result.
 *
 * Every field of {@link ProjectContent} must appear below, or a change to it
 * would be invisible to the studio's unsaved-work warning. The fingerprint test
 * walks a `Required<ProjectContent>` field by field and fails when one is missed.
 */
export function contentFingerprint(content: ProjectContent): string {
	return JSON.stringify([
		content.title,
		content.code,
		content.language,
		content.themeName,
		content.fontFamily,
		content.borderRadius,
		content.background,
		content.windowChrome ?? "",
		content.showLineNumbers ?? true,
		content.lineNumberStart ?? 1,
		content.framePadding ?? 0,
		content.cardMargin ?? 0,
		content.watermark ?? "",
		content.steps.map(fingerprintStep),
	]);
}
