import {
	type PhoneSheetInput,
	type PhoneSheetStop,
	STAGE_TOP_GAP,
	phoneSheetGeometry,
} from "./phone-sheet";

/**
 * How tall an island panel may be on the phone before it covers the frame.
 *
 * A panel rises from the instrument and the stage never reflows for it (opening
 * one lowers the sheet to the peek instead), so the only room it has is the
 * stretch between the frame's bottom and the foot of the dock. The dock is
 * everything stacked on the instrument's line: the export status, the panel,
 * the plate. This is that stretch, from the same figures that place the sheet's
 * stops: the frame hangs from the stage's top under the corner row, and the
 * dock's foot is where the sheet's stop floats it (`dockLift`, so the safe
 * areas are already in it).
 */

/** Between the frame's bottom edge and the top of whatever the dock stacks. */
export const PANEL_GAP = 8;
/**
 * The least a panel is worth: its tab row and a row or two of controls under it.
 * Where the frame fills the stage (a tall shape, a phone on its side) there is no
 * room under it at all, and a panel that shrank to nothing would be a panel that
 * cannot be used, so it covers the foot of the frame instead.
 */
export const PANEL_MIN_HEIGHT = 120;

/**
 * The tallest the panel may be, in CSS pixels, with the sheet at `stop`.
 *
 * `frameHeight` is the frame's height as drawn, which only the page knows (it is
 * the code or the canvas fit into the slot); `null` is no frame at all, and then
 * the dock may rise to the top of the stage. `rest` is what the dock stacks
 * besides the panel (the status when there is one, the margin, the plate and its
 * padding), which the page measures rather than this module repeating the
 * figures of a stylesheet.
 */
export function phonePanelRoom(
	input: PhoneSheetInput,
	stop: PhoneSheetStop,
	frameHeight: number | null,
	rest: number,
): number {
	const sheet = phoneSheetGeometry(input);
	const stageTop = sheet.rowBottom + STAGE_TOP_GAP;
	// The frame hangs from the stage's top (D4), whatever height it was drawn at.
	const frameBottom = frameHeight === null ? stageTop : stageTop + frameHeight;
	const dockBottom = input.viewportHeight - sheet.dockLift(stop);
	const room = dockBottom - (frameBottom + PANEL_GAP) - rest;
	return Math.max(PANEL_MIN_HEIGHT, Math.floor(room));
}
