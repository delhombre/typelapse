/**
 * How many scene rows the phone's list shows before it asks to be opened.
 *
 * The list sits above the code in the phone's sheet. At twenty scenes of two
 * fields each it was 2,500px tall and pushed the editor out of reach (D, 2026-10-08
 * audit), so a long list shows a window and a button for the rest. Three rows
 * keep the selected scene with one scene of context before it and one after.
 */
export const COLLAPSED_SCENE_ROWS = 3;

export interface SceneListWindow {
	/** First row shown. */
	readonly start: number;
	/** One past the last row shown. */
	readonly end: number;
	/** How many rows are behind the "show all" button. */
	readonly hidden: number;
}

/** The rows a collapsed list shows: the selected scene, with a row of context before it. */
export function sceneListWindow(input: { count: number; selected: number }): SceneListWindow {
	if (input.count <= COLLAPSED_SCENE_ROWS) {
		return { start: 0, end: input.count, hidden: 0 };
	}
	const selected = Math.min(Math.max(input.selected, 0), input.count - 1);
	const start = Math.min(Math.max(selected - 1, 0), input.count - COLLAPSED_SCENE_ROWS);
	const end = start + COLLAPSED_SCENE_ROWS;
	return { start, end, hidden: input.count - COLLAPSED_SCENE_ROWS };
}
