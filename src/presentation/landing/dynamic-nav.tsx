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

/**
 * A Dynamic Island nav: one compact, centered pill floating at the top, never
 * spanning the page. It is one solid block, so the logo, the section links and
 * the CTA move together with it.
 *
 * The pill is the island's plate (D5): `.lp-nav-pill` reads the dock's fill, ink,
 * lift and edge, and never inverts. It used to flip to paper over the dark band,
 * and on the dark theme paper-coloured ink landed on a paper-coloured pill
 * (1.05:1, brand and CTA gone). A plate that keeps its fill and gains an inset
 * hairline is the same object on every backdrop.
 *
 * It is there from the first screen, because it now offers what the hero does
 * not: the way to the stages, the proof and the pricing (three links, which a
 * phone has no room for and drops under 640px). While the hero is in view it
 * carries only those links, and on a phone only the logo: the hero's field is
 * the first screen's one way into the studio (D2), so the CTA joins the pill
 * once the hero has gone. Past the hero it also behaves as a header should:
 * hidden on the way down, back on the way up. Reduced motion keeps it put.
 */

/** How far up the hidden island tucks (past the top edge). */
const HIDDEN_Y = -104;

/** Clean slides, no overshoot: drop back in, tuck quickly away. */
const REVEAL_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
const HIDE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.3 };

const SECTIONS = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#proof", label: "Proof" },
	{ href: "#pricing", label: "Pricing" },
] as const;

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [hidden, setHidden] = useState(false);
	/* Whether the hero, and so its filled button, is still on screen. The page
	   opens on it, so the first frame already has the quiet capsule: starting
	   filled painted a yellow flash the observer then faded out. */
	const [overHero, setOverHero] = useState(true);
	/* Measured rather than assumed to be one viewport: the hero's content can
	   push it taller, and a resize can change it under us. */
	const heroBottom = useRef(0);

	useEffect(() => {
		const hero = document.querySelector(".lp-hero");
		if (!hero) {
			// No hero on this page: no other filled button to defer to.
			setOverHero(false);
			return;
		}
		const measure = () => {
			heroBottom.current = hero.getBoundingClientRect().bottom + window.scrollY;
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(hero);
		/* The same threshold as a reader's: a hero showing its last 15% is gone. */
		const seen =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(([entry]) => setOverHero(Boolean(entry?.isIntersecting)), {
						threshold: 0.15,
					});
		seen?.observe(hero);
		return () => {
			resize.disconnect();
			seen?.disconnect();
		};
	}, []);

	useMotionValueEvent(scrollY, "change", (y) => {
		if (y < heroBottom.current) {
			setHidden(false);
			return;
		}
		// Past the hero: scrolling down (y grows) hides it, scrolling up brings it
		// back. Reduced motion keeps it put instead of sliding on every reversal.
		setHidden(reduce ? false : y > (scrollY.getPrevious() ?? 0));
	});

	return (
		<header className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50 flex justify-center">
			<motion.div
				className="lp-nav-pill pointer-events-auto inline-flex h-11 items-center gap-3 rounded-full pr-[6px] pl-[15px]"
				data-over-hero={overHero ? "" : undefined}
				aria-hidden={hidden}
				inert={hidden}
				initial={false}
				animate={{ y: hidden ? HIDDEN_Y : 0, opacity: hidden ? 0 : 1 }}
				transition={reduce ? { duration: 0 } : hidden ? HIDE_TRANSITION : REVEAL_TRANSITION}
			>
				<Link to="/" aria-label="Typelapse home" className="hit-ext flex items-center gap-2">
					<Logomark size={17} />
					<span className="font-semibold text-[14px] tracking-tight">Typelapse</span>
				</Link>
				<nav aria-label="Sections" className="lp-nav-links">
					{SECTIONS.map((section) => (
						<a key={section.href} href={section.href}>
							{section.label}
						</a>
					))}
				</nav>
				{/* The capsule nests concentric in the pill: pill h44 r22, capsule h32
				    r16, so an even 6px inset (pr-[6px] + the 6px top/bottom gap). It is
				    the primary on the plate, as every filled action is (D2), and it is
				    held back while the hero is in view: the hero's field holds the first
				    screen's one way in, so "Open studio" is said once. Held back, not
				    removed: it keeps its place and fades, so the pill never changes
				    width under the reader (a phone, with no links, drops it instead). */}
				<Link
					to="/app"
					aria-label="Open studio"
					className="lp-nav-cta-link flex h-full items-center outline-offset-4"
					aria-hidden={overHero || undefined}
					inert={overHero}
					tabIndex={overHero ? -1 : undefined}
				>
					<span className="lp-nav-cta inline-flex h-8 items-center whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-[var(--color-on-primary)] shadow-[0_6px_16px_-6px_var(--color-primary-glow)] transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-primary-hover)]">
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
