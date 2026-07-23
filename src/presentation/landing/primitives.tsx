import { Logomark } from "@/presentation/components/ui/logomark";
import { type Variants, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
	LP_EASE,
	PRESS_DURATION,
	PRESS_SCALE,
	REVEAL_DURATION,
	REVEAL_DURATION_REDUCED,
	REVEAL_RISE,
	REVEAL_STAGGER,
	REVEAL_VIEWPORT,
} from "./tokens";

/* ──────────── Scroll reveal ────────────
   Soft opacity + a small rise, played once as the block scrolls in. Reduced
   motion drops the movement and just cross-fades. `immediate` plays on mount
   (for above-the-fold hero content, which is already in view). */

interface RevealProps {
	children: ReactNode;
	className?: string;
	delay?: number;
	immediate?: boolean;
}

export function Reveal({ children, className, delay = 0, immediate = false }: RevealProps) {
	const reduce = useReducedMotion();
	const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: REVEAL_RISE };
	const shown = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };
	const transition = {
		duration: reduce ? REVEAL_DURATION_REDUCED : REVEAL_DURATION,
		ease: LP_EASE,
		delay,
	};

	if (immediate) {
		return (
			<motion.div className={className} initial={hidden} animate={shown} transition={transition}>
				{children}
			</motion.div>
		);
	}

	return (
		<motion.div
			className={className}
			initial={hidden}
			whileInView={shown}
			viewport={REVEAL_VIEWPORT}
			transition={transition}
		>
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
	const parent: Variants = {
		hidden: {},
		shown: { transition: { staggerChildren: REVEAL_STAGGER, delayChildren } },
	};

	if (immediate) {
		return (
			<motion.div className={className} initial="hidden" animate="shown" variants={parent}>
				{children}
			</motion.div>
		);
	}

	return (
		<motion.div
			className={className}
			initial="hidden"
			whileInView="shown"
			viewport={REVEAL_VIEWPORT}
			variants={parent}
		>
			{children}
		</motion.div>
	);
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
	const reduce = useReducedMotion();
	const variants: Variants = reduce
		? {
				hidden: { opacity: 0 },
				shown: { opacity: 1, transition: { duration: REVEAL_DURATION_REDUCED, ease: LP_EASE } },
			}
		: {
				hidden: { opacity: 0, y: REVEAL_RISE },
				shown: { opacity: 1, y: 0, transition: { duration: REVEAL_DURATION, ease: LP_EASE } },
			};
	return (
		<motion.div className={className} variants={variants}>
			{children}
		</motion.div>
	);
}

/* ──────────── Buttons ────────────
   A solid ink pill. The press scale lives on a `motion.span` wrapper (a
   transform-only, ~160ms ease-out feedback), so the inner Link stays the honest
   navigation target and we never animate `all`. */

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
	const inner = `inline-flex items-center justify-center rounded-full bg-ink font-medium text-white transition-colors hover:bg-black ${sizing}`;

	return (
		<motion.span
			className={`inline-flex ${className}`}
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

/** A pill chip for the format / aspect / platform rows. Text auto-inverts inside
    the dark section; only the hairline changes with `tone`. */
export function Chip({
	children,
	tone = "light",
}: { children: ReactNode; tone?: "light" | "dark" }) {
	const border = tone === "dark" ? "border-white/15" : "border-black/10";
	return (
		<span
			className={`inline-flex h-9 items-center rounded-full border ${border} px-4 font-medium text-[13px] text-ink tabular-nums`}
		>
			{children}
		</span>
	);
}
