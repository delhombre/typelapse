import { Logomark } from "@/presentation/components/ui/logomark";
import {
	type Transition,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "motion/react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * A Dynamic Island nav: one compact, always-centered near-black pill floating at
 * the top. It never spans the page. It has two resting widths keyed to scroll
 * position: full at the top of the page, a touch narrower once you have scrolled
 * down. Scrolling back to the top overshoots wider and settles, so the return
 * reads as an elastic snap, while scrolling down compresses firmly with no bounce.
 * The stretch only plays on those two threshold crossings, never on every scroll
 * tick. Reduced motion keeps it perfectly still.
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

/** The two resting widths, and the transient overshoot the return passes through. */
const COMPACT_SCALE_X = 0.9;
const BASE_SCALE_X = 1;
const OVERSHOOT_SCALE_X = 1.1;

/** Compressing down is firm and quick, with no overshoot. */
const COLLAPSE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
/** Returning to the top stretches past its resting width, then settles: the
    elastic "revient". A keyframed overshoot rather than a spring bounce, so the
    stretch is actually visible and not swallowed by the tiny travel. */
const EXPAND_TRANSITION: Transition = {
	duration: 0.62,
	times: [0, 0.5, 1],
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
	// True once the island has ever been in its collapsed state, so the first paint
	// at the top of the page does not fire the overshoot animation on load.
	const primed = useRef(readInitialScrolled());

	useMotionValueEvent(scrollY, "change", (y) => {
		if (y > COLLAPSE_AT) {
			primed.current = true;
			setScrolled(true);
		} else if (y < EXPAND_AT) {
			setScrolled(false);
		}
	});

	let animateScaleX: number | (number | null)[] = BASE_SCALE_X;
	let transition: Transition = { duration: 0 };
	if (!reduce && scrolled) {
		animateScaleX = COMPACT_SCALE_X;
		transition = COLLAPSE_TRANSITION;
	} else if (!reduce) {
		// From wherever it is (null keyframe), overshoot wide, then settle to rest.
		animateScaleX = primed.current ? [null, OVERSHOOT_SCALE_X, BASE_SCALE_X] : BASE_SCALE_X;
		transition = EXPAND_TRANSITION;
	}

	let initialScaleX = BASE_SCALE_X;
	if (!reduce && scrolled) {
		initialScaleX = COMPACT_SCALE_X;
	}

	return (
		<header className="pointer-events-none sticky top-0 z-50 flex justify-center pt-2.5">
			<motion.div
				className="pointer-events-auto flex h-11 items-center gap-3 rounded-full pr-[6px] pl-[15px]"
				style={{
					background: ISLAND_BG,
					boxShadow: ISLAND_SHADOW,
					transformOrigin: "center",
					willChange: "transform",
				}}
				initial={{ scaleX: initialScaleX }}
				animate={{ scaleX: animateScaleX }}
				transition={transition}
			>
				<Link to="/" aria-label="Typelapse home" className="flex items-center gap-2 text-white">
					<Logomark size={17} />
					<span className="font-semibold text-[14px] text-white tracking-tight">Typelapse</span>
				</Link>
				{/* The violet capsule nests concentric in the pill: pill h44 r22, capsule
				    h32 r16, so an even 6px inset (pr-[6px] + the 6px top/bottom gap). */}
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
