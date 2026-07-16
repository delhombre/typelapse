import { Logomark } from "@/presentation/components/ui/logomark";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const GITHUB_URL = "https://github.com/delhombre/typelapse";
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Marketing landing at `/`. Editorial and quiet: paper, a serif line, then the
 * living instrument does the talking. No dark chrome, no glows, no feature grids.
 */
export function LandingPage() {
	return (
		<div className="landing-root relative flex min-h-dvh flex-col bg-paper font-sans text-ash antialiased">
			<Nav />
			<main className="flex-1">
				<Hero />
			</main>
		</div>
	);
}

/* ──────────── Nav ──────────── */

function Nav() {
	return (
		<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
			<a href="/" className="flex items-center gap-2.5">
				<span className="flex size-7 items-center justify-center rounded-lg bg-ink text-white">
					<Logomark size={16} />
				</span>
				<span className="font-serif text-[17px] text-ink">Typelapse</span>
			</a>
			<div className="flex items-center gap-5">
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
					className="text-ash text-sm transition-colors hover:text-ink"
				>
					GitHub
				</a>
				<Link
					to="/app"
					className="flex h-9 items-center rounded-full bg-ink px-4 text-sm text-white transition-[background-color,transform] hover:bg-black active:scale-[0.98]"
				>
					Open studio
				</Link>
			</div>
		</header>
	);
}

/* ──────────── Hero ──────────── */

function Hero() {
	return (
		<section className="mx-auto w-full max-w-xl px-6 pt-16 pb-14 text-center sm:pt-24">
			<FadeIn>
				<h1 className="font-serif font-normal text-4xl text-ink leading-[1.1] tracking-normal sm:text-5xl">
					A timelapse for your code.
				</h1>
			</FadeIn>
			<FadeIn delay={0.08}>
				<p className="mx-auto mt-5 max-w-lg text-pretty text-[17px] text-ash leading-relaxed">
					Snippets become video — token by token, morphing exactly as you see it here.
				</p>
			</FadeIn>
		</section>
	);
}

/* ──────────── Motion helper ──────────── */

/** A soft opacity + 4px lift on mount. Still, no movement, for reduced motion. */
function FadeIn({
	children,
	className,
	delay = 0,
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
}) {
	const reduce = useReducedMotion();

	if (reduce) {
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, ease: EASE, delay }}
			className={className}
		>
			{children}
		</motion.div>
	);
}
