/**
 * Where the studio draws its frame, as a pure function of the window.
 *
 * On a desktop the frame is the largest box of the export's shape that fits the
 * room the shell leaves for the picture, centred in it: `fitScale` in the
 * preview (`live-preview.tsx`) does exactly that against the room its
 * container measures. On a phone the shell's slot is the frame itself, the
 * stage's width hung under the corner row (`phone-sheet.ts`, design audit D4).
 * This module is the same arithmetic ahead of any layout, so a stand-in for the
 * studio (its boot outline) can draw the frame where the studio will put it
 * instead of at a size of its own.
 *
 * The desktop's room is `scene-stage.ts`'s at and above
 * `DESKTOP_SCENE_MIN_WIDTH`; below it the phone sheet's geometry says it.
 */

import { fitScale } from "./fit-scale";
import { phoneSheetGeometry } from "./phone-sheet";
import { DESKTOP_SCENE_MIN_WIDTH, type Room, pictureRoomAt, stageTransform } from "./scene-stage";

/** The shape a new project exports at (`RenderConfig`'s default, 1080p wide). */
const DEFAULT_SHAPE = { width: 1920, height: 1080 } as const;

export interface StageFrameInput {
	viewportWidth: number;
	viewportHeight: number;
	/** The safe areas at the top and bottom of the window, in CSS px (zero where there are none). */
	safeTop: number;
	safeBottom: number;
	/** A landscape notch's sides, which the phone's stage keeps clear of. */
	safeLeft?: number;
	safeRight?: number;
}

/** A box in window px, from the window's top-left corner. */
export type FrameBox = Room;

export interface StageFrameOptions {
	/**
	 * The desktop's code card is open (Edit): the stage is scaled about the
	 * picture's centre and moved right, as `stageTransform` says. Ignored on a
	 * phone, where the sheet and not a card holds the code.
	 */
	readonly editing?: boolean;
}

/**
 * The studio's frame at this window size, for a project that exports at the
 * default shape, with the sheet at its peek and the code card folded: the state
 * a project with scenes opens in. `editing` is the state an empty one opens in
 * on a desktop (#270).
 */
export function stageFrameBox(input: StageFrameInput, options: StageFrameOptions = {}): FrameBox {
	if (input.viewportWidth < DESKTOP_SCENE_MIN_WIDTH) {
		const { left, top, width, height } = phoneSheetGeometry({
			...input,
			aspect: DEFAULT_SHAPE.width / DEFAULT_SHAPE.height,
		}).frame;
		return { left, top, width, height };
	}
	const room = pictureRoomAt(input.viewportWidth, input.viewportHeight);
	const scale = fitScale(DEFAULT_SHAPE.width, DEFAULT_SHAPE.height, room.width, room.height);
	// The same scale the preview takes (`fitScale` on the export's own size), so
	// it is capped at 1 here too: a frame is never larger than its canvas.
	const width = DEFAULT_SHAPE.width * scale;
	const height = DEFAULT_SHAPE.height * scale;
	const folded = {
		left: room.left + (room.width - width) / 2,
		top: room.top + (room.height - height) / 2,
		width,
		height,
	};
	if (!options.editing) {
		return folded;
	}
	const { x, y, scale: editScale } = stageTransform({ folded: false });
	const scaledWidth = folded.width * editScale;
	const scaledHeight = folded.height * editScale;
	return {
		left: folded.left + (folded.width - scaledWidth) / 2 + x,
		top: folded.top + (folded.height - scaledHeight) / 2 + y,
		width: scaledWidth,
		height: scaledHeight,
	};
}
