/**
 * Where the studio's object sits on its paper.
 *
 * The scene has no columns and no bars: the preview frame is centred on the
 * page and everything else floats over it. Two things move it, and both of them
 * are transforms.
 *
 * The stage's box is fixed. It always reserves `CARD_SLOT` on its left for the
 * code card, whether or not the card is there, so the box never resizes and the
 * fit-to-viewport measurement inside it never has to be recomputed mid-flight.
 * What folding changes is where the contents of that box sit: the object slides
 * onto the page's own centre line. That is the whole reason this is a transform
 * and not a padding — a padding would relayout, remeasure and refit sixty times
 * a second, and the frame would visibly resize its way across the screen
 * instead of gliding.
 *
 * A raised sheet does not cover the object, it steps it back: a scale, plus the
 * lift that keeps the frame's middle where the eye left it once the bottom of
 * the page belongs to the sheet.
 */

/**
 * The width the card occupies, and the room the stage keeps for it either way.
 * The stylesheet does not restate it: the shell publishes this number as
 * `--sc-card-width`, because the recentre below is exactly half of it and two
 * copies of one measurement is how a stage ends up landing off centre.
 */
export const CARD_SLOT = 356;

/** How far back the stage steps when a cluster sheet rises in front of it. */
export const SHEET_SCALE = 0.82;

/** The lift that goes with the step back, so the object stays in the eye's half. */
export const SHEET_LIFT = -44;

export interface SceneState {
	/** True when the code card has been folded to its vertical tab. */
	folded: boolean;
	/** True when a cluster sheet is standing between the island and the stage. */
	sheetRaised: boolean;
}

export interface SceneTransform {
	x: number;
	y: number;
	scale: number;
}

/**
 * The stage's transform for a scene state. `reduce` drops the step back and the
 * lift — decoration answering a panel — and keeps the recentre, which is not
 * decoration: without it the object would simply sit off-centre for good.
 */
export function stageTransform(state: SceneState, reduce = false): SceneTransform {
	const x = state.folded ? -CARD_SLOT / 2 : 0;
	if (reduce || !state.sheetRaised) {
		return { x, y: 0, scale: 1 };
	}
	return { x, y: SHEET_LIFT, scale: SHEET_SCALE };
}

/**
 * The dock's transform. It shares the stage's centre line and slides with it,
 * which is what makes the fold read as one object moving rather than two. It
 * does not share the step back: the instrument that raised the sheet has to
 * stay under the finger that is about to close it.
 */
export function dockTransform(state: SceneState): { x: number } {
	return { x: state.folded ? -CARD_SLOT / 2 : 0 };
}
