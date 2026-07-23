import { Logomark } from "@/presentation/components/ui/logomark";
import {
	motion,
	useReducedMotion,
	useScroll,
	useSpring,
	useTransform,
	useVelocity,
} from "motion/react";
import { Link } from "react-router-dom";

/**
 * A Dynamic Island nav: one compact, always-centered near-black pill floating at
 * the top. It never spans the page. Scroll velocity stretches it elastically along
 * its width: scrolling down squeezes it narrower, scrolling back up stretches it
 * wider, and a bouncy spring snaps it back to its resting width when you stop.
 * Reduced motion keeps it perfectly still.
 */

/** The near-black of the real Dynamic Island. */
const ISLAND_BG = "rgba(11, 11, 15, 1)";
/** An elevated float so the pill reads as hovering over the page. */
const ISLAND_SHADOW = [
	"0 14px 34px -10px rgba(0,0,0,0.38)",
	"0 3px 10px -3px rgba(0,0,0,0.28)",
	"inset 0 1px 0 rgba(255,255,255,0.06)",
].join(", ");

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const velocity = useVelocity(scrollY);
	// Smooth the raw scroll velocity with a loose, bouncy spring so the stretch
	// overshoots and settles elastically once the scroll stops.
	const smoothVelocity = useSpring(velocity, { stiffness: 200, damping: 14, restDelta: 1 });
	// Signed velocity drives a directional stretch along the width: scrolling up
	// (negative) stretches the island wider, scrolling down (positive) squeezes it
	// narrower, and at rest (velocity 0) it snaps back to its resting width.
	const stretchX = useTransform(smoothVelocity, [-2200, 0, 2200], [1.11, 1, 0.94], { clamp: true });

	return (
		<header className="pointer-events-none sticky top-0 z-50 flex justify-center pt-2.5">
			<motion.div
				className="pointer-events-auto flex h-11 items-center gap-3 rounded-full pr-[6px] pl-[15px]"
				style={{
					background: ISLAND_BG,
					boxShadow: ISLAND_SHADOW,
					scaleX: reduce ? 1 : stretchX,
					transformOrigin: "center",
					willChange: "transform",
				}}
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
