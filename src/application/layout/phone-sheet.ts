/**
 * Where the phone's frame sits, where its bottom sheet stops, and what floats
 * on the sheet's edge.
 *
 * The geometry starts from the frame (design audit 2026-10-08, D4): the frame
 * takes the stage's full width, anchors under the corner row and keeps that
 * box at every stop, so a sheet moving under it never refits it. The sheet's
 * scenes stop is what the frame and the instrument under it leave; a frame too
 * tall to leave a useful stop below it (9:16) has no scenes stop at all. The
 * old order, a 55% sheet and the frame refit into what was left, measured a
 * 213x120 frame at 390x844, and a frame that jumped, then shrank, on release.
 *
 * Every stop is a height of sheet showing above the bottom of the screen, in
 * CSS pixels, so the drawer gets it as a pixel snap point and the shell lays
 * the instrument and the frame out from the same figure. Fractions of the
 * viewport could not say "under the corner row" or "above the home
 * indicator", and a sheet capped at 97% of the screen moved every fraction by
 * 3%: the 56px peek showed 31px, inside the home indicator's band.
 */

/** The sheet's three stops, by what each one is for. */
export type PhoneSheetStop = "peek" | "scenes" | "full";

/**
 * Where the sheet opens (gate five D3): a project with no scene yet opens on
 * the scenes stop, where its first move is on screen without a gesture, and a
 * project with scenes opens on the peek, where the frame has the screen. A
 * phone with no scenes stop resolves it to the peek.
 */
export function openingStop(sceneCount: number): PhoneSheetStop {
	return sceneCount === 0 ? "scenes" : "peek";
}

/** The handle and a breath of sheet under it, above the home indicator. */
const PEEK = 56;
/** The corner row: its margin from the top (or the notch) and its height. */
const ROW_MARGIN = 10;
const ROW_HEIGHT = 40;
/** Between the row and the frame, and between the row and the full sheet. */
export const STAGE_TOP_GAP = 18;
const FULL_TOP_GAP = 8;
/** Between the instrument and the sheet's top edge it floats on. */
const DOCK_GAP = 12;
/** The stage's side margin, or the safe area where a notch is wider (`app.css`). */
const STAGE_SIDE = 8;
/**
 * The instrument's room under the frame: the island's 48px plate under a thumb,
 * the dock's 12px of padding below it, and 12px between the frame and the plate.
 * It was 116, room for the export status's 46px as well, which stood empty
 * above the 60px bar whenever nothing was exporting. A status that shows floats
 * over the frame's foot at the scenes stop, as it floats over the stage at the
 * other stops.
 */
const ISLAND_PLATE = 48;
const DOCK_PADDING = 12;
const FRAME_GAP = 12;
export const DOCK_ROOM = ISLAND_PLATE + DOCK_PADDING + FRAME_GAP;
/** A scenes stop must show at least one scene row more than the peek does. */
const MIN_SCENES_GAIN = 120;
/** The shape a new project exports at (1920x1080). */
const DEFAULT_ASPECT = 16 / 9;

export interface PhoneSheetInput {
	readonly viewportWidth: number;
	readonly viewportHeight: number;
	readonly safeTop: number;
	readonly safeBottom: number;
	/** A landscape notch's sides; zero where there is none. */
	readonly safeLeft?: number;
	readonly safeRight?: number;
	/** The export's width over its height; 16:9 when it is not given. */
	readonly aspect?: number;
}

/** What moves the sheet to another stop without a finger. */
export type PhoneSheetStep = "raise" | "lower" | "cycle" | "first" | "last";

/** A box in window px, from the window's top-left corner. */
export interface PhoneFrameBox {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

export interface PhoneSheetGeometry {
	/** Where the corner row ends, from the top of the screen. */
	readonly rowBottom: number;
	/** The frame: the same box at every stop. */
	readonly frame: PhoneFrameBox;
	/** How much of the window lies under the stage's slot, which is the frame's height. */
	readonly stageBottom: number;
	/** `scenes` is null when the frame leaves no useful stop below it. */
	readonly stops: { readonly peek: number; readonly scenes: number | null; readonly full: number };
	/** The stops that exist, lowest first. */
	readonly order: readonly PhoneSheetStop[];
	/** The stop the sheet is at, given a stop it may no longer have. */
	resolve(stop: PhoneSheetStop): PhoneSheetStop;
	/** The stop a key or an assistive technology's raise or lower asks for. */
	step(stop: PhoneSheetStop, step: PhoneSheetStep): PhoneSheetStop;
	/** How far above the bottom of the screen the instrument floats. */
	dockLift(stop: PhoneSheetStop): number;
	/**
	 * The same, for a sheet at any height, so the instrument can follow a finger:
	 * `visible` is how much of the sheet shows above the bottom of the screen. It
	 * equals `dockLift` on every stop.
	 */
	dockLiftAt(visible: number): number;
}

export function phoneSheetGeometry({
	viewportWidth,
	viewportHeight,
	safeTop,
	safeBottom,
	safeLeft = 0,
	safeRight = 0,
	aspect = DEFAULT_ASPECT,
}: PhoneSheetInput): PhoneSheetGeometry {
	const rowBottom = Math.max(ROW_MARGIN, safeTop) + ROW_HEIGHT;
	const peek = PEEK + safeBottom;
	const full = Math.max(peek, viewportHeight - rowBottom - FULL_TOP_GAP);

	// The frame: the stage's width, unless the height above the peek's instrument
	// is the shorter side, which a tall shape or a phone on its side makes it.
	const stageLeft = Math.max(STAGE_SIDE, safeLeft);
	const stageWidth = Math.max(0, viewportWidth - stageLeft - Math.max(STAGE_SIDE, safeRight));
	const top = rowBottom + STAGE_TOP_GAP;
	const heightRoom = Math.max(0, viewportHeight - top - (peek + DOCK_GAP) - DOCK_ROOM);
	const shape = aspect > 0 && Number.isFinite(aspect) ? aspect : DEFAULT_ASPECT;
	const width = Math.min(stageWidth, heightRoom * shape);
	const height = width / shape;
	const frame = { left: stageLeft + (stageWidth - width) / 2, top, width, height };

	// Whole pixels: the drawer takes the stops as snap points.
	const scenesCandidate = Math.min(
		Math.floor(viewportHeight - (top + height) - DOCK_ROOM - DOCK_GAP),
		full,
	);
	const scenes = scenesCandidate - peek >= MIN_SCENES_GAIN ? scenesCandidate : null;

	const resolve = (stop: PhoneSheetStop): PhoneSheetStop =>
		stop === "scenes" && scenes === null ? "peek" : stop;
	const order = (["peek", "scenes", "full"] as const).filter(
		(name) => name !== "scenes" || scenes !== null,
	);
	// Lowest the instrument goes: clear of the home indicator, and the full stop's rest.
	const floor = Math.max(DOCK_GAP, safeBottom);
	// The highest stop the instrument rides the sheet's edge to; past it the
	// instrument comes down to the bottom, where the full stop keeps it.
	const ride = scenes ?? peek;

	return {
		rowBottom,
		frame,
		stageBottom: viewportHeight - (top + height),
		stops: { peek, scenes, full },
		order,
		resolve,
		step: (stop, step) => {
			const at = order.indexOf(resolve(stop));
			const last = order.length - 1;
			const to =
				step === "raise"
					? Math.min(at + 1, last)
					: step === "lower"
						? Math.max(at - 1, 0)
						: step === "cycle"
							? at >= last
								? 0
								: at + 1
							: step === "first"
								? 0
								: last;
			return order[to] ?? "peek";
		},
		dockLiftAt: (visible) => {
			if (visible <= ride) {
				return Math.max(floor, visible + DOCK_GAP);
			}
			const along = full > ride ? Math.min(1, (visible - ride) / (full - ride)) : 1;
			return ride + DOCK_GAP + (floor - (ride + DOCK_GAP)) * along;
		},
		// Over the full sheet the instrument sits at the bottom of the screen, on
		// the sheet, clear of the home indicator.
		dockLift: (stop) => {
			const at = resolve(stop);
			if (at === "full") {
				return floor;
			}
			return (at === "scenes" ? (scenes ?? peek) : peek) + DOCK_GAP;
		},
	};
}
