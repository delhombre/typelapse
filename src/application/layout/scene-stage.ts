/**
 * Where the studio's object sits on its paper.
 *
 * The video canvas owns the page centre. Opening Edit reveals a temporary code
 * sheet and moves the canvas beside it without resizing the layout box.
 *
 * The box remains full-width in both states. Edit composes a horizontal shift
 * and a small scale so Monaco can arrive without forcing the preview through a
 * sixty-frame reflow.
 *
 * Settings are modes inside the instrument rail. They never enter this
 * geometry: a visual decision is easier to judge when opening its controls
 * does not move or rescale the picture under inspection.
 */

import { BASE_VIDEO_SCALE, MIN_TEXT_PX, REFERENCE_SHORT_EDGE } from "./canvas-fit";

/**
 * The width of the temporary code sheet. Its companion transform is half this
 * value, which keeps the sheet and the video optically balanced.
 */
export const CARD_SLOT = 356;

/** Smallest viewport where the editor and a useful picture can coexist. */
export const DESKTOP_SCENE_MIN_WIDTH = 1280;

/** The video gives the editor room without becoming a thumbnail. */
export const EDIT_STAGE_SCALE = 0.9;

/** The code type the studio opens with (`Theme`'s default), which the floor is measured at. */
export const REFERENCE_EDITOR_FONT_PX = 14;

/**
 * The shortest picture the stage will show: the height of the export canvas
 * where the studio's own code type still draws at `MIN_TEXT_PX`, the floor the
 * exporters already hold (canvas-fit). A window too short for it makes the
 * desktop shell scroll vertically rather than fit the picture into what is
 * left: 1440x500 gave a 128 by 72 thumbnail, and a scroll is honest where a
 * thumbnail is not. Measured on the 16:9 canvas at the opening type size, at
 * rest: Edit's 0.9 push-in is a transform on top of it.
 */
export const STAGE_FLOOR_HEIGHT = Math.ceil(
	(MIN_TEXT_PX * REFERENCE_SHORT_EDGE) / (REFERENCE_EDITOR_FONT_PX * BASE_VIDEO_SCALE),
);

export interface SceneState {
	/** True when the code card has been folded to its vertical tab. */
	folded: boolean;
}

export interface SceneTransform {
	x: number;
	y: number;
	scale: number;
}

/**
 * The stage's transform for a scene state. The left and right reservations are
 * structural, so reduced motion changes the transition used to reach them, not
 * the resulting layout.
 */
export function stageTransform(state: SceneState, _reduce = false): SceneTransform {
	const editing = !state.folded;
	return {
		x: editing ? CARD_SLOT / 2 : 0,
		y: 0,
		scale: editing ? EDIT_STAGE_SCALE : 1,
	};
}

/**
 * The dock's transform. Preview and controls are one instrument, so both use
 * the same centre line while temporary panels enter or leave. Their matching
 * spring keeps that relationship legible throughout the move.
 */
export function dockTransform(state: SceneState): { x: number } {
	return { x: state.folded ? 0 : CARD_SLOT / 2 };
}
