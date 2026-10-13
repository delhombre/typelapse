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
import { useSectionInView } from "./use-section-in-view";

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
 *
 * The pill never changes width where it can be seen: a centred pill that grows
 * moves its logo, a layout shift on every visit. When the hero comes or goes
 * with the pill on screen, it tucks away, takes or drops its CTA out of sight,
 * and drops back in (round 3 of the #248 review: CLS 0, no hole, no jump).
 */

/** How far up the hidden island tucks (past the top edge). */
const HIDDEN_Y = -104;

/** Clean slides, no overshoot: drop back in, tuck quickly away. */
const REVEAL_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.42 };
const HIDE_TRANSITION: Transition = { type: "spring", bounce: 0, duration: 0.3 };

/** How long the tuck takes to clear the top edge before the CTA is swapped, in ms. */
export const NAV_TUCK_MS = 320;
/** Under reduced motion the tuck is instant: two frames out of sight are enough. */
const NAV_TUCK_REDUCED_MS = 34;
/** The frames the swapped pill stays out of sight before it drops back in. */
const NAV_SETTLE_MS = 34;

/** One entry of the pill: an anchor on this page, or the page the visitor is on. */
export interface NavLinkItem {
	readonly href: string;
	readonly label: string;
	/** This entry is the page on screen, which a reader of the pill is told. */
	readonly current?: boolean;
}

const SECTIONS: readonly NavLinkItem[] = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#proof", label: "Proof" },
	{ href: "#pricing", label: "Pricing" },
];

interface DynamicNavProps {
	/** What the pill links to. The landing's own sections by default. */
	readonly links?: readonly NavLinkItem[];
	/**
	 * Whether the page opens on the landing's hero. The pill holds back its
	 * "Open studio" while the hero's field is in view; a page with no hero has no
	 * field to defer to, so the pill carries it from the first frame.
	 */
	readonly hasHero?: boolean;
}

export function DynamicNav({ links = SECTIONS, hasHero = true }: DynamicNavProps = {}) {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [hidden, setHidden] = useState(false);
	/* Whether the hero, and so its filled button, is still on screen. The page
	   opens on it, so the first frame already has the quiet capsule: starting
	   filled painted a yellow flash the observer then faded out. */
	const [overHero, setOverHero] = useState(hasHero);
	/* Whether the pill holds its CTA. It follows `overHero`, but only while the
	   pill is out of sight. It starts without, as the page opens on the hero
	   (which is not in the document yet when this first renders). */
	const [withCta, setWithCta] = useState(!hasHero);
	const [tucking, setTucking] = useState(false);
	const wantCta = !overHero;
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

	const inView = useSectionInView(
		links.filter((link) => link.href.startsWith("#")).map((link) => link.href.slice(1)),
	);

	/* The hero came or went: tuck, swap out of sight, then drop back in. A pill
	   already hidden by the scroll stays hidden through it. */
	useEffect(() => {
		if (withCta === wantCta) {
			return;
		}
		setTucking(true);
		const swap = window.setTimeout(
			() => setWithCta(wantCta),
			reduce ? NAV_TUCK_REDUCED_MS : NAV_TUCK_MS,
		);
		return () => window.clearTimeout(swap);
	}, [withCta, wantCta, reduce]);

	useEffect(() => {
		if (!tucking || withCta !== wantCta) {
			return;
		}
		const back = window.setTimeout(() => setTucking(false), NAV_SETTLE_MS);
		return () => window.clearTimeout(back);
	}, [tucking, withCta, wantCta]);

	const out = hidden || tucking;

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
				data-cta-off={withCta ? undefined : ""}
				aria-hidden={out}
				inert={out}
				initial={false}
				animate={{ y: out ? HIDDEN_Y : 0, opacity: out ? 0 : 1 }}
				transition={reduce ? { duration: 0 } : out ? HIDE_TRANSITION : REVEAL_TRANSITION}
			>
				<Link to="/" aria-label="Typelapse home" className="hit-ext flex items-center gap-2">
					<Logomark size={17} />
					<span className="font-semibold text-[14px] tracking-tight">Typelapse</span>
				</Link>
				<nav aria-label="Sections" className="lp-nav-links">
					{links.map((link) => (
						<a
							key={link.href}
							href={link.href}
							aria-current={
								link.current ? "page" : link.href === `#${inView}` ? "location" : undefined
							}
						>
							{link.label}
						</a>
					))}
				</nav>
				{/* The capsule nests concentric in the pill: pill h44 r22, capsule h32
				    r16, so an even 6px inset (pr-[6px] + the 6px top/bottom gap). It is
				    the primary on the plate, as every filled action is (D2), and it is
				    not there while the hero is in view: the hero's field holds the first
				    screen's one way in, so "Open studio" is said once. */}
				<Link
					to="/app"
					aria-label="Open studio"
					className="lp-nav-cta-link flex h-full items-center outline-offset-4"
					hidden={!withCta}
				>
					<span className="lp-nav-cta inline-flex h-8 items-center whitespace-nowrap rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-[var(--color-on-primary)] shadow-[0_6px_16px_-6px_var(--color-primary-glow)] transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-primary-hover)]">
						Open studio
					</span>
				</Link>
			</motion.div>
		</header>
	);
}
