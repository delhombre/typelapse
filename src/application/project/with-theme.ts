import type { ProjectPayload } from "./project-payload";

/**
 * The studio's theme picker, on a project file: the whole theme swaps, so the
 * font and the radius the old theme brought do not stay behind (the project
 * then draws the new theme's own). The CLI's `--theme` and the hosted render's
 * `theme` option both come through here, which is why a hosted video and an
 * artifact made from the same inputs agree on the look.
 */
export function withTheme(project: ProjectPayload, themeName: string): ProjectPayload {
	const { fontFamily: _font, borderRadius: _radius, ...rest } = project;
	return { ...rest, themeName };
}
