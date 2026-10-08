/**
 * Where the studio draws its frame, as a pure function of the window.
 *
 * The frame is the largest box of the export's shape that fits the room the
 * shell leaves for the picture, centred in it: `fitScale` in the preview
 * (`live-preview.tsx`) does exactly that against the room its container
 * measures. This module is the same arithmetic ahead of any layout, so a
 * stand-in for the studio (its boot outline) can draw the frame where the
 * studio will put it instead of at a size of its own.
 *
 * The room is the desktop shell's (`scene-stage.ts`) at and above
 * `DESKTOP_SCENE_MIN_WIDTH`, and below it the phone's: the slot between the
 * corner row and the instrument's room (`phone-sheet.ts`), which the sheet's
 * peek sets.
 */

import { fitScale } from "./fit-scale";
import { DOCK_ROOM, STAGE_TOP_GAP, phoneSheetGeometry } from "./phone-sheet";
import { DESKTOP_SCENE_MIN_WIDTH, type Room, pictureRoomAt } from "./scene-stage";

/** The shape a new project exports at (`RenderConfig`'s default, 1080p wide). */
const DEFAULT_SHAPE = { width: 1920, height: 1080 } as const;

/** The phone slot's side padding (`app.css`: `.sc-root-mobile .sc-stage-slot`), clear of the notch. */
const PHONE_SLOT_PAD_X = 8;
/** The preview's own inset around its frame where the shell names none (`live-preview.tsx`: 2rem). */
const PREVIEW_INSET = 32;

export interface StageFrameInput {
	viewportWidth: number;
	viewportHeight: number;
	/** The safe areas at the top and bottom of the window, in CSS px (zero where there are none). */
	safeTop: number;
	safeBottom: number;
}

/** A box in window px, from the window's top-left corner. */
export type FrameBox = Room;

/** The room a phone's frame is fit into: the slot, less the preview's inset. */
function phoneRoom({ viewportWidth, viewportHeight, safeTop, safeBottom }: StageFrameInput): Room {
	const sheet = phoneSheetGeometry({ viewportHeight, safeTop, safeBottom });
	const left = PHONE_SLOT_PAD_X + PREVIEW_INSET;
	const top = sheet.rowBottom + STAGE_TOP_GAP + PREVIEW_INSET;
	const bottom = sheet.stageLift("peek") + DOCK_ROOM + PREVIEW_INSET;
	return {
		left,
		top,
		width: viewportWidth - 2 * left,
		height: viewportHeight - top - bottom,
	};
}

/**
 * The studio's frame at this window size, for a project that exports at the
 * default shape, with the sheet at its peek and the code card folded: the state
 * the studio opens in.
 */
export function stageFrameBox(input: StageFrameInput): FrameBox {
	const room =
		input.viewportWidth >= DESKTOP_SCENE_MIN_WIDTH
			? pictureRoomAt(input.viewportWidth, input.viewportHeight)
			: phoneRoom(input);
	const scale = fitScale(DEFAULT_SHAPE.width, DEFAULT_SHAPE.height, room.width, room.height);
	// The same scale the preview takes (`fitScale` on the export's own size), so
	// it is capped at 1 here too: a frame is never larger than its canvas.
	const width = DEFAULT_SHAPE.width * scale;
	const height = DEFAULT_SHAPE.height * scale;
	return {
		left: room.left + (room.width - width) / 2,
		top: room.top + (room.height - height) / 2,
		width,
		height,
	};
}
