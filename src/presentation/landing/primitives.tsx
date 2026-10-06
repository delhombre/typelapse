import { Logomark } from "@/presentation/components/ui/logomark";
import { type Variants, motion, useReducedMotion } from "motion/react";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	LP_EASE,
	PRESS_DURATION,
	PRESS_SCALE,
	REVEAL_BLUR,
	REVEAL_DURATION,
	REVEAL_EASE,
	REVEAL_RISE,
	REVEAL_SCALE,
	REVEAL_STAGGER,
} from "./tokens";

const INTRO_SESSION_KEY = "typelapse.landing-intro-seen";
const LandingIntroContext = createContext(false);

/** One entrance per browsing session, and none under reduced motion. The
 * decision is shared by every hero primitive so the copy and product instrument
 * arrive as one composition. Reduced motion used to cross-fade for 400ms
 * instead: still motion nobody asked for, on copy ready on the first frame. */
export function LandingIntroProvider({ children }: { children: ReactNode }) {
	const reduce = useReducedMotion();
	const [firstVisit] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return window.sessionStorage.getItem(INTRO_SESSION_KEY) !== "1";
	});
	const animate = firstVisit && !reduce;

	useEffect(() => {
		if (animate) {
			window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
		}
	}, [animate]);

	return <LandingIntroContext.Provider value={animate}>{children}</LandingIntroContext.Provider>;
}

export function useLandingIntro(): boolean {
	return useContext(LandingIntroContext);
}

/* ──────────── Intro reveal ────────────
   The hero materializes once per session: opacity, a small rise, a whisper of
   scale-up and a blur that resolves, so it reads as coming into focus rather than
   a flat fade. Only `immediate` blocks play (the hero, already in view); every
   other Reveal is a plain block, since nothing on the page enters on scroll. */

interface RevealProps {
	children: ReactNode;
	className?: string;
	delay?: number;
	immediate?: boolean;
}

export function Reveal({ children, className, delay = 0, immediate = false }: RevealProps) {
	const animateIntro = useLandingIntro();
	if (!immediate || !animateIntro) {
		return <div className={className}>{children}</div>;
	}
	const hidden = { opacity: 0, y: REVEAL_RISE, scale: REVEAL_SCALE, filter: REVEAL_BLUR };
	const shown = { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
	const transition = { duration: REVEAL_DURATION, ease: REVEAL_EASE, delay };

	return (
		<motion.div className={className} initial={hidden} animate={shown} transition={transition}>
			{children}
		</motion.div>
	);
}

/* A staggered group: children mount in sequence. Pair `RevealGroup` with
   `RevealItem` children so a heading, line and control settle one after another. */

interface RevealGroupProps {
	children: ReactNode;
	className?: string;
	immediate?: boolean;
	delayChildren?: number;
}

export function RevealGroup({
	children,
	className,
	immediate = false,
	delayChildren = 0,
}: RevealGroupProps) {
	const animateIntro = useLandingIntro();
	const parent: Variants = {
		hidden: {},
		shown: { transition: { staggerChildren: REVEAL_STAGGER, delayChildren } },
	};

	if (!immediate || !animateIntro) {
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div className={className} initial="hidden" animate="shown" variants={parent}>
			{children}
		</motion.div>
	);
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
	if (!useLandingIntro()) {
		return <div className={className}>{children}</div>;
	}
	const variants: Variants = {
		hidden: { opacity: 0, y: REVEAL_RISE, scale: REVEAL_SCALE, filter: REVEAL_BLUR },
		shown: {
			opacity: 1,
			y: 0,
			scale: 1,
			filter: "blur(0px)",
			transition: { duration: REVEAL_DURATION, ease: REVEAL_EASE },
		},
	};
	return (
		<motion.div className={className} variants={variants}>
			{children}
		</motion.div>
	);
}

/* ──────────── Buttons ────────────
   A confident accent-violet rounded rect, with a soft
   accent-tinted shadow for depth. On hover it lifts a hair and its accent shadow
   deepens (physical, not bouncy); on press it scales down. The lift + press scale
   live on a `motion.span` wrapper (transform-only, ~160ms ease-out), so the inner
   Link stays the honest navigation target and we never animate `all`. */

interface InkButtonProps {
	to?: string;
	href?: string;
	children: ReactNode;
	size?: "md" | "lg";
	className?: string;
}

export function InkButton({ to, href, children, size = "md", className = "" }: InkButtonProps) {
	const reduce = useReducedMotion();
	const sizing = size === "lg" ? "h-12 px-7 text-[15px]" : "h-11 px-5 text-sm";
	/* The hover is the primary's own lighter step, not a filter over it: a
	   `brightness()` on a saturated yellow lifts the green as fast as the red and
	   the hue walks. The glow under it is the primary too, so it reads as the
	   button's own light rather than a grey shadow that happens to be there. */
	const inner = `inline-flex items-center justify-center rounded-full bg-[var(--color-cta)] font-medium text-[var(--color-on-primary)] shadow-[0_6px_20px_-6px_var(--color-primary-glow)] transition-[background-color,box-shadow] duration-200 hover:bg-[var(--color-primary-hover)] hover:shadow-[0_11px_28px_-7px_var(--color-primary-glow)] ${sizing}`;

	return (
		<motion.span
			className={`inline-flex ${className}`}
			whileHover={reduce ? undefined : { y: -1 }}
			whileTap={reduce ? undefined : { scale: PRESS_SCALE }}
			transition={{ duration: PRESS_DURATION, ease: LP_EASE }}
		>
			{href ? (
				<a href={href} target="_blank" rel="noreferrer" className={inner}>
					{children}
				</a>
			) : (
				<Link to={to ?? "/app"} className={inner}>
					{children}
				</Link>
			)}
		</motion.span>
	);
}

/* ──────────── Small type atoms ──────────── */

/** A sans uppercase kicker above a heading (its accent dot is drawn in CSS). */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
	return <p className={`lp-eyebrow ${className}`}>{children}</p>;
}

/** The landing brand lockup: the play-head mark next to "Typelapse" in the landing
    sans, mirroring the studio top-nav treatment so both read as one brand. Ink on
    the paper sections; `markSize` and `textClassName` tune the two nav vs footer sizes. */
export function LogoLockup({
	markSize,
	textClassName,
}: { markSize: number; textClassName: string }) {
	return (
		<span className="inline-flex items-center gap-2 text-ink">
			<Logomark size={markSize} />
			<span className={`font-semibold tracking-tight ${textClassName}`}>Typelapse</span>
		</span>
	);
}
