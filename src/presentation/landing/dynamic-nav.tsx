import { Logomark } from "@/presentation/components/ui/logomark";
import {
	type Transition,
	motion,
	useMotionValueEvent,
	useReducedMotion,
	useScroll,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useOverDark } from "./use-over-dark";

/**
 * A Dynamic Island nav: one compact, centered near-black pill floating at the top,
 * never spanning the page. It is one solid block, so the logo and CTA move together
 * with it.
 *
 * It is absent for the whole hero. The hero already is what the nav offers — the
 * product's name and the way in — so a pill repeating both, over the paste field
 * of all things, is a second copy of the page's first screen. Past the hero it
 * behaves as a header should: hidden on the way down, back on the way up. The
 * move is a clean slide with no stretch; reduced motion keeps it put once it is
 * earned, and still absent before that.
 */

/** The near-black of the real Dynamic Island — and its inverse, for the
    sections that are already dark. A near-black pill on a near-black band is a
    pill you cannot see; the page alternates the two, so the island has to know
    which it is over. */
const ISLAND_BG = "rgba(11, 11, 15, 1)";
const ISLAND_BG_ON_DARK = "#faf9f6";
/** The strip the island floats in: 12 of top offset and 44 of pill. */
const ISLAND_BAND = 56;
/** An elevated float so the pill reads as hovering over the page. */
const ISLAND_SHADOW = [
	"0 14px 34px -10px rgba(0,0,0,0.38)",
	"0 3px 10px -3px rgba(0,0,0,0.28)",
	"inset 0 1px 0 rgba(255,255,255,0.06)",
].join(", ");

/** How far up the hidden island tucks (past the top edge). */
const HIDDEN_Y = -104;

/** Clean slides, no overshoot: drop back in, tuck quickly away. */
const REVEAL_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
const HIDE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.3 };

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const onDark = useOverDark(ISLAND_BAND);
	/* Starts away: the page opens on the hero, and the hero is where it does not
	   belong. */
	const [hidden, setHidden] = useState(true);
	/* Measured rather than assumed to be one viewport: the hero is `min-h`, so
	   its content can push it taller, and a resize can change it under us. */
	const heroBottom = useRef(Number.POSITIVE_INFINITY);

	useEffect(() => {
		const hero = document.querySelector(".lp-hero");
		if (!hero) {
			// No hero on this page: nothing to stay out of the way of.
			heroBottom.current = 0;
			setHidden(false);
			return;
		}
		const measure = () => {
			heroBottom.current = hero.getBoundingClientRect().bottom + window.scrollY;
			setHidden(window.scrollY < heroBottom.current);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(hero);
		return () => observer.disconnect();
	}, []);

	useMotionValueEvent(scrollY, "change", (y) => {
		if (y < heroBottom.current) {
			setHidden(true);
			return;
		}
		// Past the hero: scrolling down (y grows) hides it, scrolling up brings it
		// back. Reduced motion keeps it put instead of sliding on every reversal.
		setHidden(reduce ? false : y > (scrollY.getPrevious() ?? 0));
	});

	const isHidden = hidden;

	return (
		<header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
			<motion.div
				className="pointer-events-auto inline-flex h-11 items-center gap-3 rounded-full pr-[6px] pl-[15px] transition-colors duration-300 ease-[var(--ease-out)]"
				style={{ background: onDark ? ISLAND_BG_ON_DARK : ISLAND_BG, boxShadow: ISLAND_SHADOW }}
				initial={false}
				animate={{ y: isHidden ? HIDDEN_Y : 0, opacity: isHidden ? 0 : 1 }}
				transition={reduce ? { duration: 0 } : isHidden ? HIDE_TRANSITION : REVEAL_TRANSITION}
			>
				<Link
					to="/"
					aria-label="Typelapse home"
					className={`hit-ext flex items-center gap-2 transition-colors duration-300 ease-[var(--ease-out)] ${onDark ? "text-ink" : "text-white"}`}
				>
					<Logomark size={17} />
					<span className="font-semibold text-[14px] tracking-tight">Typelapse</span>
				</Link>
				{/* The capsule nests concentric in the pill: pill h44 r22, capsule h32
				    r16, so an even 6px inset (pr-[6px] + the 6px top/bottom gap). It
				    takes the same rule every filled action takes — whichever of the
				    primary and the ink contrasts with what it sits on — and here that is
				    the pill, which has just flipped underneath it. */}
				<Link
					to="/app"
					aria-label="Open studio"
					className="flex h-full items-center outline-offset-4"
				>
					{/* The glow belongs to the fill, so it flips with it. Left outside the
					    branch it stayed the primary's yellow under an ink capsule — a
					    coloured light under a shape that is not that colour, which reads
					    as a halo rather than as depth. It transitions with the colours
					    too: a shadow that cuts while the fill it belongs to fades is the
					    same seam one step out. */}
					<span
						className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.5 font-medium text-[12.5px] transition-[background-color,color,box-shadow] duration-300 ease-[var(--ease-out)] ${
							onDark
								? "bg-ink text-paper shadow-[0_6px_16px_-6px_rgb(28_27_25/0.45)] hover:bg-ink/86"
								: "bg-[var(--color-cta)] text-[var(--color-on-primary)] shadow-[0_6px_16px_-6px_var(--color-primary-glow)] hover:bg-[var(--color-primary-hover)]"
						}`}
					>
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
