/**
 * Where each screen of an always-mounted app switcher sits, given which one is
 * active.
 *
 * The gesture is the same as the mount/unmount version it replaces: the screen
 * leaving goes out to the left, the one arriving comes in from the right, both
 * scaled down while they travel. The difference is that every screen stays
 * mounted, so instead of an enter/exit pair we describe *all* of them on one
 * track and let the browser composite what it already rastered.
 *
 * Three roles, derived from the forward distance `d = (index - active) % count`:
 *
 * - `d === 0`: the active screen, at rest, full size.
 * - `d === count - 1`: the screen the cycle just left — it is the one exiting, so
 *   it sits out to the *left*.
 * - everything else: waiting on the right, out of sight.
 *
 * The subtlety is the wrap. Because the cycle is a ring, the screen that exited
 * on the *previous* switch (`d === count - 2`) has to travel from the left side
 * back to the waiting side. Animating that would drag it right across the
 * screen, so it is flagged `animated: false` and repositioned instantly — both
 * ends of that move are offscreen, so nothing is ever seen jumping. Only the two
 * screens actually taking part in the current switch animate.
 *
 * The ring reads the roles off the active index alone, which holds as long as
 * the cycle advances one step forward at a time — what `usePlatformCycle` does.
 */

export interface ScreenPlacement {
	/** `translateX`, as a percentage of the screen's own width. */
	x: string;
	scale: number;
	/** False when the move happens entirely offscreen and must not be animated. */
	animated: boolean;
}

export interface ScreenPlacementParams {
	index: number;
	activeIndex: number;
	count: number;
	/** Extra travel beyond 100%, so the two screens read as two cards with a gap. */
	gap: number;
	/** How far a travelling screen lifts away, matching the released-flick feel. */
	offscreenScale: number;
}

/** A ring is only wide enough to hold a waiting side from three screens up. */
const MIN_RING = 3;

export function screenPlacement({
	index,
	activeIndex,
	count,
	gap,
	offscreenScale,
}: ScreenPlacementParams): ScreenPlacement {
	const size = Math.max(1, count);
	const active = ((activeIndex % size) + size) % size;
	const distance = (((index - active) % size) + size) % size;

	if (distance === 0) {
		return { x: "0%", scale: 1, animated: true };
	}

	const offscreen = 100 + gap;
	if (size >= MIN_RING && distance === size - 1) {
		return { x: `${-offscreen}%`, scale: offscreenScale, animated: true };
	}

	/* Waiting on the right. Below `MIN_RING` there is no waiting side to hide a
	   reposition in, so the idle screen simply animates from the right. */
	return {
		x: `${offscreen}%`,
		scale: offscreenScale,
		animated: size < MIN_RING,
	};
}
