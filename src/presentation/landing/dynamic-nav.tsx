import { Logomark } from "@/presentation/components/ui/logomark";
import {
	motion,
	type Transition,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "motion/react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * A Dynamic Island nav: one compact, always-centered near-black pill floating at
 * the top. It never spans the page. The content (logo + CTA) is one solid centred
 * block that never moves relative to itself; the pill's symmetric horizontal
 * padding is what animates, so the island physically lengthens and shortens around
 * the content, like the real Dynamic Island. Full at the top, a touch shorter once
 * you scroll down, and on the way back up it overshoots longer then settles, so the
 * return reads as an elastic snap. Animating padding (not a scaleX) keeps the round
 * end-caps and the text intact, and can never clip or tear the content. Reduced
 * motion keeps it perfectly still.
 */

/** The near-black of the real Dynamic Island. */
const ISLAND_BG = "rgba(11, 11, 15, 1)";
/** An elevated float so the pill reads as hovering over the page. */
const ISLAND_SHADOW = [
	"0 14px 34px -10px rgba(0,0,0,0.38)",
	"0 3px 10px -3px rgba(0,0,0,0.28)",
	"inset 0 1px 0 rgba(255,255,255,0.06)",
].join(", ");

/** Hysteresis: collapse once past the upper mark, expand only back under the lower
    one, so the state cannot flicker while the scroll hovers a single boundary. */
const COLLAPSE_AT = 60;
const EXPAND_AT = 16;

/** The two resting side-paddings (px), plus the transient wide overshoot and the
    small rebound the return springs through. The pill length is the content plus
    twice this, so animating it lengthens the island without touching the content. */
const COMPACT_PAD = 10;
const BASE_PAD = 18;
const OVERSHOOT_PAD = 40;
const REBOUND_PAD = 15;

/** Compressing down is firm and quick, with no overshoot. */
const COLLAPSE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
/** Returning to the top springs past its resting length, dips back, then settles:
    a keyframed spring so the elastic "revient" is actually visible on a short travel
    (a real spring's overshoot would be swallowed by how little the padding moves). */
const EXPAND_TRANSITION: Transition = {
	duration: 0.66,
	times: [0, 0.4, 0.72, 1],
	ease: [0.16, 1, 0.3, 1],
};

function readInitialScrolled(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.scrollY > COLLAPSE_AT;
}

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [scrolled, setScrolled] = useState(readInitialScrolled);
	// True once the island has ever been collapsed, so the first paint at the top
	// of the page does not fire the overshoot animation on load.
	const primed = useRef(readInitialScrolled());

	useMotionValueEvent(scrollY, "change", (y) => {
		if (y > COLLAPSE_AT) {
			primed.current = true;
			setScrolled(true);
		} else if (y < EXPAND_AT) {
			setScrolled(false);
		}
	});

	let pad: number | (number | null)[] = BASE_PAD;
	let transition: Transition = { duration: 0 };
	if (reduce) {
		pad = scrolled ? COMPACT_PAD : BASE_PAD;
	} else if (scrolled) {
		pad = COMPACT_PAD;
		transition = COLLAPSE_TRANSITION;
	} else if (primed.current) {
		// From wherever it is (null keyframe), spring wide, dip back, settle to rest.
		pad = [null, OVERSHOOT_PAD, REBOUND_PAD, BASE_PAD];
		transition = EXPAND_TRANSITION;
	} else {
		// First paint at the top: no visible move (initial already sits at base).
		pad = BASE_PAD;
	}
	const initialPad = scrolled ? COMPACT_PAD : BASE_PAD;

	return (
		<header className="pointer-events-none sticky top-0 z-50 flex justify-center pt-2.5">
			<motion.div
				className="pointer-events-auto inline-flex h-11 items-center gap-5 rounded-full"
				style={{ background: ISLAND_BG, boxShadow: ISLAND_SHADOW }}
				initial={{ paddingLeft: initialPad, paddingRight: initialPad }}
				animate={{ paddingLeft: pad, paddingRight: pad }}
				transition={transition}
			>
				<Link to="/" aria-label="Typelapse home" className="flex items-center gap-2 text-white">
					<Logomark size={17} />
					<span className="font-semibold text-[14px] text-white tracking-tight">Typelapse</span>
				</Link>
				<Link
					to="/app"
					aria-label="Open studio"
					className="flex h-full items-center outline-offset-4"
				>
					<span className="inline-flex h-8 items-center rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-white shadow-[0_6px_16px_-6px_oklch(0.56_0.19_268/0.6)]">
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
