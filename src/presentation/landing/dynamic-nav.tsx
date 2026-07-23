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
 * A Dynamic Island nav (after the 21st.dev component): one compact, always-centered
 * near-black pill floating at the top. It never spans the page. Its length is driven
 * by scroll state through the pill's horizontal padding, and Motion's `layout`
 * springs that size change, so scrolling down settles it firmly shorter and
 * returning to the top snaps it elastically longer. The inner content also carries
 * `layout`, so Motion counter-scales it and the logo and text stay crisp while only
 * the pill's box stretches (no scaleX distortion of the content). Reduced motion
 * makes the change instant.
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

/** The two resting side-paddings (px). The pill length is the content plus twice
    this, so springing it between the two lengthens and shortens the island. */
const COMPACT_PAD = 10;
const BASE_PAD = 26;

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

	useMotionValueEvent(scrollY, "change", (y) => {
		if (y > COLLAPSE_AT) {
			setScrolled(true);
		} else if (y < EXPAND_AT) {
			setScrolled(false);
		}
	});

	const pad = scrolled ? COMPACT_PAD : BASE_PAD;
	// Firm, no-overshoot settle on the way down; an elastic snap on the way back up.
	let transition: Transition = { type: "spring", bounce: scrolled ? 0.14 : 0.52, duration: 0.6 };
	if (reduce) {
		transition = { duration: 0 };
	}

	return (
		<header className="pointer-events-none sticky top-0 z-50 flex justify-center pt-2.5">
			<motion.div
				layout
				transition={transition}
				className="pointer-events-auto inline-flex h-11 items-center rounded-full"
				style={{
					background: ISLAND_BG,
					boxShadow: ISLAND_SHADOW,
					paddingLeft: pad,
					paddingRight: pad,
				}}
			>
				<motion.div layout className="flex items-center gap-5">
					<Link to="/" aria-label="Typelapse home" className="flex items-center gap-2 text-white">
						<Logomark size={17} />
						<span className="font-semibold text-[14px] text-white tracking-tight">Typelapse</span>
					</Link>
					<Link to="/app" aria-label="Open studio" className="flex items-center outline-offset-4">
						<span className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-white shadow-[0_6px_16px_-6px_oklch(0.56_0.19_268/0.6)]">
							Open studio
						</span>
					</Link>
				</motion.div>
			</motion.div>
		</header>
	);
}
