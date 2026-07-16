import { LogoWordmark } from "@/presentation/components/ui/logo-wordmark";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FrameFan } from "./frame-fan";
import { Instrument } from "./instrument";

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
				<FadeIn delay={0.16}>
					<Instrument />
				</FadeIn>
				<div className="mx-auto mt-24 max-w-5xl px-6">
					<div className="border-black/8 border-t" />
				</div>
				<FadeIn>
					<FrameFan />
				</FadeIn>
				<CapabilityStrip />
				<Prose />
				<Cta />
			</main>
			<Footer />
		</div>
	);
}

/* ──────────── Nav ──────────── */

function Nav() {
	return (
		<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
			<a href="/" className="flex items-center">
				<LogoWordmark height={22} className="text-ink" />
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
					Snippets (even whole pull requests) become video, token by token, exactly as you see it
					here.
				</p>
			</FadeIn>
		</section>
	);
}

/* ──────────── Capabilities ──────────── */

/** What the tool actually does today: four plain columns, one line each. */
const CAPABILITIES: [string, string][] = [
	["Export", "MP4 · WebM · GIF · PNG"],
	["Look", "7 themes · 4 window chromes · mesh, solid & image backdrops"],
	["Motion", "token morph · typewriter · spotlight & zoom · captions · tempo"],
	["Import", "paste code · a git diff · or a GitHub PR URL"],
];

/** A quiet ledger of the feature set, kept in the page's editorial voice. */
function CapabilityStrip() {
	return (
		<FadeIn className="mx-auto max-w-5xl px-6 py-16">
			<dl className="grid grid-cols-1 gap-x-10 gap-y-8 border-black/8 border-t pt-12 sm:grid-cols-2 lg:grid-cols-4">
				{CAPABILITIES.map(([label, detail]) => (
					<div key={label}>
						<dt className="font-mono text-[10px] text-ash uppercase tracking-[0.18em]">{label}</dt>
						<dd className="mt-2 text-[14px] text-ink leading-relaxed">{detail}</dd>
					</div>
				))}
			</dl>
		</FadeIn>
	);
}

/* ──────────── Prose ──────────── */

function Prose() {
	return (
		<FadeIn className="mx-auto max-w-md px-6 py-16 text-center">
			<p className="text-[15px] text-ash leading-[1.9]">
				Paste a snippet (or a unified diff, or a GitHub pull-request URL), capture a few steps, and
				export an MP4, WebM or GIF in 16:9, 1:1, 9:16, 4:5 or 3:4, with synthesized typing sounds if
				you like. Typelapse is free and <ProseLink href={GITHUB_URL}>open source</ProseLink> under
				the <ProseLink href={`${GITHUB_URL}/blob/main/LICENSE`}>MIT license</ProseLink>. It runs
				locally: your code never leaves your machine.{" "}
				<ProseLink href={GITHUB_URL}>Read the source</ProseLink>.
			</p>
		</FadeIn>
	);
}

function ProseLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="font-medium text-ink underline-offset-4 hover:underline"
		>
			{children}
		</a>
	);
}

/* ──────────── Final action ──────────── */

function Cta() {
	return (
		<FadeIn className="px-6 py-16 text-center">
			<Link
				to="/app"
				className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-medium text-[15px] text-white transition-[background-color,transform] hover:bg-black active:scale-[0.98]"
			>
				Open the studio
			</Link>
			<p className="mt-4 font-mono text-[11px] text-ash">no sign-up · runs in your browser</p>
		</FadeIn>
	);
}

/* ──────────── Footer ──────────── */

function Footer() {
	return (
		<footer className="border-black/8 border-t">
			<div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8">
				<div className="flex items-center gap-2">
					<LogoWordmark height={17} className="text-ink" />
					<span className="text-[13px] text-ash">a timelapse for your code</span>
				</div>
				<div className="flex items-center gap-5 text-[13px]">
					<Link to="/app" className="text-ash transition-colors hover:text-ink">
						Studio
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="text-ash transition-colors hover:text-ink"
					>
						GitHub
					</a>
				</div>
			</div>
		</footer>
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
