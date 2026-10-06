/**
 * Where the phone's bottom sheet stops, and what floats on its edge.
 *
 * Every number is a height of sheet showing above the bottom of the screen, in
 * CSS pixels, so the drawer gets it as a pixel snap point and the shell lays
 * the instrument and the frame out from the same figure. Fractions of the
 * viewport could not say "under the corner row" or "above the home
 * indicator", and a sheet capped at 97% of the screen moved every fraction by
 * 3%: the 56px peek showed 31px, inside the home indicator's band.
 */

/** The sheet's three stops, by what each one is for. */
export type PhoneSheetStop = "peek" | "scenes" | "full";

/** The handle and a breath of sheet under it, above the home indicator. */
const PEEK = 56;
/** The scenes stop's share of the screen when the frame has room to spare. */
const SCENES_SHARE = 0.55;
/** The corner row: its margin from the top (or the notch) and its height. */
const ROW_MARGIN = 10;
const ROW_HEIGHT = 40;
/** Between the row and the frame, and between the row and the full sheet. */
const STAGE_TOP_GAP = 18;
const FULL_TOP_GAP = 8;
/** Between the instrument and the sheet's top edge it floats on. */
const DOCK_GAP = 12;
/** The instrument and the export status above it. */
export const DOCK_ROOM = 116;
/** The least frame worth keeping: a 16:9 picture 213px wide. */
const MIN_STAGE = 120;
/** A scenes stop must show at least one scene row more than the peek does. */
const MIN_SCENES_GAIN = 120;

export interface PhoneSheetInput {
	readonly viewportHeight: number;
	readonly safeTop: number;
	readonly safeBottom: number;
}

/** What moves the sheet to another stop without a finger. */
export type PhoneSheetStep = "raise" | "lower" | "cycle" | "first" | "last";

export interface PhoneSheetGeometry {
	/** Where the corner row ends, from the top of the screen. */
	readonly rowBottom: number;
	/** `scenes` is null when the frame would have no room above it. */
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
	/** The room under the frame, which the frame does not refit into over the full sheet. */
	stageLift(stop: PhoneSheetStop): number;
}

export function phoneSheetGeometry({
	viewportHeight,
	safeTop,
	safeBottom,
}: PhoneSheetInput): PhoneSheetGeometry {
	const rowBottom = Math.max(ROW_MARGIN, safeTop) + ROW_HEIGHT;
	const peek = PEEK + safeBottom;
	const full = Math.max(peek, viewportHeight - rowBottom - FULL_TOP_GAP);
	const scenesRoom =
		viewportHeight - (rowBottom + STAGE_TOP_GAP) - MIN_STAGE - DOCK_ROOM - DOCK_GAP;
	const scenesCandidate = Math.min(Math.round(viewportHeight * SCENES_SHARE), scenesRoom, full);
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
	const edge = (stop: PhoneSheetStop) => {
		const at = resolve(stop);
		return (at === "scenes" ? (scenes ?? peek) : at === "full" ? full : peek) + DOCK_GAP;
	};

	return {
		rowBottom,
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
			if (visible <= ride) return Math.max(floor, visible + DOCK_GAP);
			const along = full > ride ? Math.min(1, (visible - ride) / (full - ride)) : 1;
			return ride + DOCK_GAP + (floor - (ride + DOCK_GAP)) * along;
		},
		// Over the full sheet the instrument sits at the bottom of the screen, on
		// the sheet, clear of the home indicator.
		dockLift: (stop) => (resolve(stop) === "full" ? Math.max(DOCK_GAP, safeBottom) : edge(stop)),
		stageLift: (stop) =>
			edge(resolve(stop) === "full" ? (scenes === null ? "peek" : "scenes") : stop),
	};
}
