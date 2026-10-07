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

/**
 * Before the shell scrolls it gives up room it does not need. Above
 * `SHELL_SQUEEZE_FROM + SHELL_SQUEEZE_RANGE` px of window height the bands
 * around the picture are as the short-window rule leaves them (the comfortable
 * size); below it they shrink in step with the window, to their squeezed size
 * at `SHELL_SQUEEZE_FROM`, and a window shorter than that scrolls. 650 is the
 * height a 1366x768 laptop's browser leaves the page, which must fit.
 */
export const SHELL_SQUEEZE_FROM = 650;
export const SHELL_SQUEEZE_RANGE = 100;

/** The tallest window the short-window rule (timeline 190, tighter bands) applies to. */
export const SHORT_WINDOW_MAX_HEIGHT = 760;

/**
 * The bands the squeeze moves, in px: the stage slot's top and bottom padding,
 * and the preview's inset around its picture on every side. The bottom ones are
 * what keeps the picture clear of the dock, which sits `DOCK_CLEARANCE` px
 * above the slot's bottom edge, so they never squeeze past `MIN_DOCK_GAP`.
 */
export const STAGE_BANDS = {
	padTop: { squeezed: 0, comfortable: 10 },
	padBottom: { squeezed: 40, comfortable: 60 },
	frameInset: { squeezed: 16, comfortable: 32 },
} as const;
export const DOCK_CLEARANCE = 44;
export const MIN_DOCK_GAP = 12;

/** The tall shell's own bands, which the squeeze never reaches. */
const TALL_SHELL = { padTop: 18, padBottom: 72, frameInset: 32, timeline: 218 } as const;
const SHORT_SHELL_TIMELINE = 190;
/** The header, and the gaps the timeline stack keeps (`studio-camera.css`: --camera-header and friends). */
const SHELL_HEADER = 80;
const TIMELINE_BOTTOM = 16;
const TIMELINE_GAP = 8;

export interface StageBands {
	padTop: number;
	padBottom: number;
	frameInset: number;
}

/** The squeezed bands for a window height, from `SHELL_SQUEEZE_FROM` up to the comfortable ones. */
export function stageBandsAt(viewportHeight: number): StageBands {
	const squeeze = Math.min(Math.max(viewportHeight - SHELL_SQUEEZE_FROM, 0), SHELL_SQUEEZE_RANGE);
	const share = squeeze / SHELL_SQUEEZE_RANGE;
	const band = ({ squeezed, comfortable }: { squeezed: number; comfortable: number }) =>
		squeezed + (comfortable - squeezed) * share;
	return {
		padTop: band(STAGE_BANDS.padTop),
		padBottom: band(STAGE_BANDS.padBottom),
		frameInset: band(STAGE_BANDS.frameInset),
	};
}

/**
 * The squeeze as custom properties for the stylesheet, which does the same
 * arithmetic against `100dvh`: each band is its squeezed size plus its slope
 * (px of band per px of squeeze) times the squeeze.
 */
export function stageSqueezeVars(): Record<string, string> {
	const slope = ({ squeezed, comfortable }: { squeezed: number; comfortable: number }) =>
		String((comfortable - squeezed) / SHELL_SQUEEZE_RANGE);
	return {
		"--sc-squeeze-start": `${SHELL_SQUEEZE_FROM}px`,
		"--sc-squeeze-range": `${SHELL_SQUEEZE_RANGE}px`,
		"--sc-pad-top-squeezed": `${STAGE_BANDS.padTop.squeezed}px`,
		"--sc-pad-top-slope": slope(STAGE_BANDS.padTop),
		"--sc-pad-bottom-squeezed": `${STAGE_BANDS.padBottom.squeezed}px`,
		"--sc-pad-bottom-slope": slope(STAGE_BANDS.padBottom),
		"--sc-frame-inset-squeezed": `${STAGE_BANDS.frameInset.squeezed}px`,
		"--sc-frame-inset-slope": slope(STAGE_BANDS.frameInset),
	};
}

function shellAt(viewportHeight: number) {
	return viewportHeight > SHORT_WINDOW_MAX_HEIGHT
		? TALL_SHELL
		: { ...stageBandsAt(viewportHeight), timeline: SHORT_SHELL_TIMELINE };
}

/** Everything under the stage: the timeline and the gaps around it. */
function timelineStack(timeline: number): number {
	return timeline + TIMELINE_BOTTOM + TIMELINE_GAP;
}

/** The least height the desktop shell can be at this window height: below it the page scrolls. */
export function shellMinHeightAt(viewportHeight: number): number {
	const shell = shellAt(viewportHeight);
	return (
		SHELL_HEADER +
		shell.padTop +
		shell.padBottom +
		2 * shell.frameInset +
		STAGE_FLOOR_HEIGHT +
		timelineStack(shell.timeline)
	);
}

/** The picture's height at this window height, the shell being as tall as it must be. */
export function pictureHeightAt(viewportHeight: number): number {
	const shell = shellAt(viewportHeight);
	return (
		Math.max(viewportHeight, shellMinHeightAt(viewportHeight)) -
		SHELL_HEADER -
		shell.padTop -
		shell.padBottom -
		2 * shell.frameInset -
		timelineStack(shell.timeline)
	);
}

/** The stage slot's side padding on the desktop shell (`studio-camera.css`: `.sc-stage-slot`). */
export const STAGE_SLOT_PAD_X = 44;

/** A rectangle in window px, from the window's top-left corner. */
export interface Room {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * The room the desktop shell's picture is fit into at this window size: what
 * the stage slot leaves between the header and the timeline, less the bands
 * around the picture. The frame is the largest 16:9 (or whatever the export's
 * shape is) box that fits it, centred.
 */
export function pictureRoomAt(viewportWidth: number, viewportHeight: number): Room {
	const { padTop, frameInset } = shellAt(viewportHeight);
	const inset = STAGE_SLOT_PAD_X + frameInset;
	return {
		left: inset,
		top: SHELL_HEADER + padTop + frameInset,
		width: viewportWidth - 2 * inset,
		height: pictureHeightAt(viewportHeight),
	};
}

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
