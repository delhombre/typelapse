import { Logomark } from "@/presentation/components/ui/logomark";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { InkButton, LogoLockup } from "./primitives";
import { GITHUB_URL, LP_EASE } from "./tokens";

/**
 * Scroll-reactive Dynamic Island nav.
 *
 * At the very top the header is a full-bleed frosted bar (basically the classic
 * nav): CONTAINER-width content, a hairline bottom edge, ink on paper. As the page
 * scrolls it retracts — the frosted material fades, the shell contracts inward,
 * darkens to a near-black capsule, rounds to a pill, lifts a few pixels and centers.
 * Scroll back to the top and it unfolds. One spring drives the whole morph so it is
 * fluid and interruptible, like the iOS Dynamic Island.
 *
 * Threshold + hysteresis: collapse once past 56px, expand only below 24px, so it
 * never flickers when the scroll position rests near the boundary.
 */

/** Apple critically-damped spring: a hint of life, no visible wobble. */
const MORPH_SPRING = { type: "spring" as const, bounce: 0.14, duration: 0.5 };

/** Content cross-fade: opacity-only, synced under the geometry morph. */
const CONTENT_FADE = { duration: 0.24, ease: LP_EASE };
const CONTENT_FADE_REDUCED = { duration: 0.16, ease: "linear" as const };

/** Collapse past this, expand below the lower bound (hysteresis kills flicker). */
const COLLAPSE_AT = 56;
const EXPAND_AT = 24;

/** The near-black of the real Dynamic Island. */
const ISLAND_RGB = "11, 11, 15";

/* Three matching shadow layers in both states so motion interpolates cleanly:
   flat + invisible when expanded, an elevated float when collapsed. */
const SHADOW_FLAT =
	"0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0), inset 0 1px 0 rgba(255,255,255,0)";
const SHADOW_ISLAND =
	"0 14px 34px -10px rgba(0,0,0,0.38), 0 3px 10px -3px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)";

function readInitialCollapsed(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.scrollY > COLLAPSE_AT;
}

export function DynamicNav() {
	const reduce = useReducedMotion();
	const { scrollY } = useScroll();
	const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);

	useMotionValueEvent(scrollY, "change", (y) => {
		setCollapsed((prev) => {
			if (!prev && y > COLLAPSE_AT) {
				return true;
			}
			if (prev && y < EXPAND_AT) {
				return false;
			}
			return prev;
		});
	});

	const shellTarget = collapsed
		? {
				maxWidth: 252,
				height: 46,
				borderRadius: 999,
				y: 10,
				backgroundColor: `rgba(${ISLAND_RGB}, 1)`,
				boxShadow: SHADOW_ISLAND,
			}
		: {
				maxWidth: 1100,
				height: 64,
				borderRadius: 24,
				y: 0,
				backgroundColor: `rgba(${ISLAND_RGB}, 0)`,
				boxShadow: SHADOW_FLAT,
			};

	const shellTransition = reduce ? { duration: 0 } : MORPH_SPRING;
	const contentTransition = reduce ? CONTENT_FADE_REDUCED : CONTENT_FADE;

	return (
		<header className="sticky top-0 z-50 h-16">
			{/* Full-bleed frosted material: the classic top bar. Fades out on collapse
			    so the pill is left floating over the scrolled content. */}
			<motion.div
				aria-hidden
				className="absolute inset-x-0 top-0 h-16 border-black/[0.07] border-b bg-paper/85 backdrop-blur-lg backdrop-saturate-150"
				style={{ boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.6)" }}
				initial={false}
				animate={{ opacity: collapsed ? 0 : 1 }}
				transition={contentTransition}
			/>

			{/* The morphing shell: bar at the top, Dynamic Island once scrolled. */}
			<motion.div
				className="absolute inset-x-0 top-0 mx-auto w-full"
				style={{ willChange: "transform" }}
				initial={false}
				animate={shellTarget}
				transition={shellTransition}
			>
				{/* Expanded content: the full bar. Ink on the frosted paper. */}
				<motion.div
					inert={collapsed || undefined}
					className="absolute inset-0 flex items-center justify-between px-6 sm:px-8"
					initial={false}
					animate={{ opacity: collapsed ? 0 : 1 }}
					transition={contentTransition}
				>
					<Link to="/" aria-label="Typelapse home" className="-m-2 flex items-center p-2">
						<LogoLockup markSize={20} textClassName="text-lg" />
					</Link>
					<nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noreferrer"
							className="flex h-11 items-center rounded-full px-3 text-ash text-sm transition-colors hover:text-ink"
						>
							GitHub
						</a>
						<InkButton to="/app">Open studio</InkButton>
					</nav>
				</motion.div>

				{/* Collapsed content: the compact pill. The logo hugs the left rounded end
				    and the violet capsule nests at the right with an even 7px inset, so its
				    corner (r16) sits concentric inside the pill (h46, r23): 23 - 16 = 7 on
				    every side. justify-between fills the pill edge to edge, no black caps. */}
				<motion.div
					inert={!collapsed || undefined}
					className="absolute inset-0 flex items-center justify-between pr-[7px] pl-[15px]"
					initial={false}
					animate={{ opacity: collapsed ? 1 : 0 }}
					transition={contentTransition}
				>
					<Link
						to="/"
						aria-label="Typelapse home"
						className="flex items-center gap-2 text-white"
					>
						<Logomark size={17} />
						<span className="font-semibold text-[14px] text-white tracking-tight">Typelapse</span>
					</Link>
					<Link
						to="/app"
						className="flex h-full items-center outline-offset-4"
						aria-label="Open studio"
					>
						<span className="inline-flex h-8 items-center rounded-full bg-[var(--color-cta)] px-3.5 font-medium text-[12.5px] text-white shadow-[0_6px_16px_-6px_oklch(0.56_0.19_268/0.6)]">
							Open studio
						</span>
					</Link>
				</motion.div>
			</motion.div>
		</header>
	);
}
