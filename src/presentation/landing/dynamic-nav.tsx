import { Logomark } from "@/presentation/components/ui/logomark";
import {
	type Transition,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

/**
 * A Dynamic Island nav: one compact, centered near-black pill floating at the top,
 * never spanning the page. It is one solid block, so the logo and CTA move together
 * with it. Past a certain scroll depth it hides when you scroll down and drops back
 * into view when you scroll up (the classic reveal-on-scroll-up header); near the
 * very top it always stays. The move is a clean slide with no stretch. Reduced
 * motion keeps it pinned and visible.
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

/** Clean slides, no overshoot: drop back in, tuck quickly away. */
const REVEAL_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
const HIDE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.3 };

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [hidden, setHidden] = useState(false);

	useMotionValueEvent(scrollY, "change", (y) => {
		const previous = scrollY.getPrevious() ?? 0;
		if (y < REVEAL_AT) {
			setHidden(false);
		} else {
			// Scrolling down (y grows) hides it; scrolling up brings it back.
			setHidden(y > previous);
		}
	});

	const isHidden = hidden && !reduce;

	return (
		<header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
			<motion.div
				className="pointer-events-auto inline-flex h-11 items-center gap-3 rounded-full pr-[6px] pl-[15px]"
				style={{ background: ISLAND_BG, boxShadow: ISLAND_SHADOW }}
				initial={false}
				animate={{ y: isHidden ? HIDDEN_Y : 0, opacity: isHidden ? 0 : 1 }}
				transition={reduce ? { duration: 0 } : isHidden ? HIDE_TRANSITION : REVEAL_TRANSITION}
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
					<span className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-white shadow-[0_6px_16px_-6px_oklch(0.56_0.19_268/0.6)]">
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
