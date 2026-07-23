import { Logomark } from "@/presentation/components/ui/logomark";
import {
	type TargetAndTransition,
	type Transition,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "motion/react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * A Dynamic Island nav: one compact, centered near-black pill floating at the top,
 * never spanning the page. It is one solid block, so the logo and CTA move together
 * with it. Past a certain scroll depth it hides when you scroll down and drops back
 * into view when you scroll up (the classic reveal-on-scroll-up header); near the
 * very top it always stays. On the way back in it also gives a short elastic length
 * pulse (its real horizontal padding springs wider, then settles), so the island
 * feels alive without ever scaling or distorting its content. Reduced motion keeps
 * it pinned, visible and still.
 */

/** The near-black of the real Dynamic Island. */
const ISLAND_BG = "rgba(11, 11, 15, 1)";
/** An elevated float so the pill reads as hovering over the page. */
const ISLAND_SHADOW = [
	"0 14px 34px -10px rgba(0,0,0,0.38)",
	"0 3px 10px -3px rgba(0,0,0,0.28)",
	"inset 0 1px 0 rgba(255,255,255,0.06)",
].join(", ");

/** Above this scroll depth the island always shows; below it, direction decides. */
const REVEAL_AT = 90;
/** How far up the hidden island tucks (past the top edge). */
const HIDDEN_Y = -104;

/** Resting side paddings (the logo nests left, the CTA capsule nests concentric
    right at 6px), and how much wider each side springs during the reveal pulse. */
const BASE_PL = 15;
const BASE_PR = 6;
const PULSE = 13;

/** Drop back in with a soft spring; tuck away quickly and cleanly. */
const REVEAL_TRANSITION: Transition = { type: "spring", bounce: 0.2, duration: 0.5 };
const HIDE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.32 };
/** The elastic length pulse: stretch wide, then settle. Keyframed so the overshoot
    is visible on a short travel rather than swallowed by a plain spring. */
const PULSE_TRANSITION: Transition = {
	duration: 0.6,
	times: [0, 0.42, 1],
	ease: [0.16, 1, 0.3, 1],
};

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [hidden, setHidden] = useState(false);
	// True once the island has hidden at least once, so the reveal pulse only fires
	// on a genuine scroll-up return, never on the first paint.
	const primed = useRef(false);

	useMotionValueEvent(scrollY, "change", (y) => {
		const previous = scrollY.getPrevious() ?? 0;
		if (y < REVEAL_AT) {
			setHidden(false);
		} else {
			// Scrolling down (y grows) hides it; scrolling up brings it back.
			const goingDown = y > previous;
			if (goingDown) {
				primed.current = true;
			}
			setHidden(goingDown);
		}
	});

	const isHidden = hidden && !reduce;

	let animate: TargetAndTransition;
	let transition: Transition;
	if (isHidden) {
		animate = { y: HIDDEN_Y, opacity: 0, paddingLeft: BASE_PL, paddingRight: BASE_PR };
		transition = HIDE_TRANSITION;
	} else if (primed.current && !reduce) {
		// Reveal: drop in, and pulse the padding wider then back for the elastic snap.
		animate = {
			y: 0,
			opacity: 1,
			paddingLeft: [BASE_PL, BASE_PL + PULSE, BASE_PL],
			paddingRight: [BASE_PR, BASE_PR + PULSE, BASE_PR],
		};
		transition = {
			y: REVEAL_TRANSITION,
			opacity: { duration: 0.28 },
			paddingLeft: PULSE_TRANSITION,
			paddingRight: PULSE_TRANSITION,
		};
	} else {
		animate = { y: 0, opacity: 1, paddingLeft: BASE_PL, paddingRight: BASE_PR };
		transition = { duration: 0 };
	}

	return (
		<header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
			<motion.div
				className="pointer-events-auto inline-flex h-11 items-center gap-3 rounded-full"
				style={{ background: ISLAND_BG, boxShadow: ISLAND_SHADOW }}
				initial={false}
				animate={animate}
				transition={transition}
			>
				<Link to="/" aria-label="Typelapse home" className="flex items-center gap-2 text-white">
					<Logomark size={17} />
					<span className="font-semibold text-[14px] text-white tracking-tight">Typelapse</span>
				</Link>
				{/* The violet capsule nests concentric in the pill: pill h44 r22, capsule
				    h32 r16, so an even 6px inset at rest (BASE_PR + the 6px top/bottom gap). */}
				<Link
					to="/app"
					aria-label="Open studio"
					className="flex h-full items-center outline-offset-4"
				>
					<span className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-white shadow-[0_6px_16px_-6px_oklch(0.56_0.19_268/0.6)]">
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
