import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LandingDemo } from "./landing-demo";

const GITHUB_URL = "https://github.com/delhombre/typelapse";
const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Marketing landing page at `/`. Deliberately dark and self-contained. */
export function LandingPage() {
	return (
		<div className="dark relative min-h-dvh overflow-x-clip bg-[#08080d] font-sans text-neutral-300 antialiased">
			<LandingNav />
			<main>
				<Hero />
				<Features />
				<HowItWorks />
				<FinalCta />
			</main>
			<Footer />
		</div>
	);
}

/* ──────────── Nav ──────────── */

function LandingNav() {
	return (
		<header className="sticky top-0 z-50 border-b border-white/5 bg-[#08080d]/70 backdrop-blur-xl">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<a href="/" className="flex items-center gap-2.5">
					<span className="flex size-7 items-center justify-center rounded-lg bg-white text-neutral-900">
						<LogoGlyph />
					</span>
					<span className="text-sm font-semibold tracking-tight text-white">Typelapse</span>
				</a>
				<nav className="hidden items-center gap-8 text-sm text-neutral-400 md:flex">
					<a className="transition-colors hover:text-white" href="#features">
						Features
					</a>
					<a className="transition-colors hover:text-white" href="#how">
						How it works
					</a>
					<a
						className="transition-colors hover:text-white"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
				</nav>
				<Link
					to="/app"
					className="flex h-9 items-center rounded-xl bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
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
		<section className="relative isolate">
			{/* Ambient glow */}
			<div
				aria-hidden="true"
				className="-z-10 pointer-events-none absolute inset-x-0 top-[-10%] mx-auto h-[540px] max-w-4xl blur-[120px]"
				style={{
					background:
						"radial-gradient(60% 60% at 50% 40%, rgba(124,92,246,0.28), transparent 70%), radial-gradient(45% 45% at 70% 55%, rgba(6,182,212,0.18), transparent 70%)",
				}}
			/>

			<div className="mx-auto w-full max-w-6xl px-6 pt-20 pb-16 text-center sm:pt-28">
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, ease: EASE }}
					className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 font-mono text-[11px] tracking-wide text-neutral-300"
				>
					<span className="text-accent">✦</span> A timelapse for your code
				</motion.div>

				<motion.h1
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
					className="mx-auto max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
				>
					Your code deserves a{" "}
					<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
						better GIF
					</span>
					.
				</motion.h1>

				<motion.p
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.12 }}
					className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-400"
				>
					Typelapse morphs your snippets token by token into buttery MP4, WebM and GIF — for your
					posts, PRs and docs. What you preview is exactly what you export, frame for frame.
				</motion.p>

				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.19 }}
					className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
				>
					<Link
						to="/app"
						className="group flex h-12 items-center gap-2 rounded-2xl bg-accent px-6 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_30px_-8px_var(--color-accent)] transition hover:brightness-110"
					>
						Open the studio
						<ArrowIcon />
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 font-medium text-neutral-200 transition hover:bg-white/10"
					>
						<GithubIcon />
						Star on GitHub
					</a>
				</motion.div>

				<motion.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.3 }}
					className="mt-5 font-mono text-xs text-neutral-500"
				>
					No sign-up · runs in your browser · free &amp; open source
				</motion.p>
			</div>

			{/* Live demo */}
			<motion.div
				initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
				className="mx-auto w-full max-w-2xl px-6 pb-24"
			>
				<LandingDemo />
				<p className="mt-4 text-center font-mono text-[11px] text-neutral-600">
					Live — this is the real engine, looping.
				</p>
			</motion.div>
		</section>
	);
}

/* ──────────── Features ──────────── */

interface FeatureCard {
	icon: ReactNode;
	title: string;
	body: string;
	wide?: boolean;
}

const FEATURES: FeatureCard[] = [
	{
		icon: <MagicIcon />,
		title: "Token-level magic move",
		body: "Not a crossfade. Every token finds its place — shared code glides, new code fades in. The smooth two-beat morph that makes it read like a screen recording, not a slideshow.",
		wide: true,
	},
	{
		icon: <WysiwygIcon />,
		title: "WYSIWYG export",
		body: "One engine drives the preview and the video. The MP4 matches what you see frame for frame — no surprises on export.",
	},
	{
		icon: <AspectIcon />,
		title: "Made for social",
		body: "16:9, 1:1, 9:16, 4:5, 3:4. Reels, Shorts and TikTok — pick the exact aspect and ship.",
	},
	{
		icon: <DropletIcon />,
		title: "Living backgrounds",
		body: "Animated mesh gradients that loop seamlessly, plus grain, glow and macOS chrome. Or go transparent.",
	},
	{
		icon: <PaletteIcon />,
		title: "Themes & fonts",
		body: "Seven editor themes and five mono fonts, with a watermark for your handle.",
	},
	{
		icon: <LoopIcon />,
		title: "Typewriter & loop",
		body: "Type the first step out character by character, and loop back to the start with no hard cut.",
	},
];

function Features() {
	return (
		<section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-24 sm:py-32">
			<Reveal className="mx-auto max-w-2xl text-center">
				<SectionEyebrow>Everything you need</SectionEyebrow>
				<h2 className="mt-4 text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
					Built to beat a screenshot.
				</h2>
				<p className="mt-4 text-pretty text-neutral-400">
					The animation engine is the product. Everything else is there to make it effortless.
				</p>
			</Reveal>

			<div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
				{FEATURES.map((f, i) => (
					<Reveal
						key={f.title}
						delay={i * 0.06}
						className={f.wide ? "md:col-span-2" : "md:col-span-1"}
					>
						<article className="group h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.05]">
							<span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/20">
								{f.icon}
							</span>
							<h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
							<p className="mt-2 text-pretty text-sm leading-relaxed text-neutral-400">{f.body}</p>
						</article>
					</Reveal>
				))}
			</div>
		</section>
	);
}

/* ──────────── How it works ──────────── */

const STEPS = [
	{
		n: "01",
		title: "Paste your code",
		body: "Drop in a snippet, pick a language and a theme. The preview lights up instantly.",
	},
	{
		n: "02",
		title: "Capture steps",
		body: "Edit, then capture. Each snapshot becomes a frame the engine morphs between.",
	},
	{
		n: "03",
		title: "Export & share",
		body: "Render to MP4, WebM or GIF in the aspect you need, then drop it anywhere.",
	},
] as const;

function HowItWorks() {
	return (
		<section id="how" className="relative scroll-mt-20 border-y border-white/5 bg-white/[0.015]">
			<div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
				<Reveal className="mx-auto max-w-2xl text-center">
					<SectionEyebrow>Three steps</SectionEyebrow>
					<h2 className="mt-4 text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
						From snippet to video in a minute.
					</h2>
				</Reveal>

				<div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
					{STEPS.map((s, i) => (
						<Reveal key={s.n} delay={i * 0.08}>
							<div className="flex flex-col">
								<span className="font-mono text-sm text-accent">{s.n}</span>
								<div className="mt-3 h-px w-full bg-gradient-to-r from-white/15 to-transparent" />
								<h3 className="mt-5 text-xl font-semibold text-white">{s.title}</h3>
								<p className="mt-2 text-pretty text-sm leading-relaxed text-neutral-400">
									{s.body}
								</p>
							</div>
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}

/* ──────────── Final CTA ──────────── */

function FinalCta() {
	return (
		<section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
			<Reveal className="relative isolate overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] px-6 py-20 text-center">
				<div
					aria-hidden="true"
					className="-z-10 pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(50% 80% at 50% 0%, rgba(124,92,246,0.25), transparent 70%)",
					}}
				/>
				<h2 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
					Ready to make your code move?
				</h2>
				<p className="mx-auto mt-4 max-w-xl text-pretty text-neutral-400">
					Open the studio and export your first animation in under a minute. No account needed.
				</p>
				<Link
					to="/app"
					className="mt-8 inline-flex h-12 items-center gap-2 rounded-2xl bg-accent px-7 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_30px_-8px_var(--color-accent)] transition hover:brightness-110"
				>
					Open the studio
					<ArrowIcon />
				</Link>
			</Reveal>
		</section>
	);
}

/* ──────────── Footer ──────────── */

function Footer() {
	return (
		<footer className="border-t border-white/5">
			<div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
				<div className="flex items-center gap-2.5">
					<span className="flex size-6 items-center justify-center rounded-md bg-white text-neutral-900">
						<LogoGlyph small />
					</span>
					<span className="text-sm font-semibold text-white">Typelapse</span>
					<span className="ml-2 font-mono text-xs text-neutral-600">timelapse for code</span>
				</div>
				<div className="flex items-center gap-6 text-sm text-neutral-400">
					<a className="transition-colors hover:text-white" href="#features">
						Features
					</a>
					<Link className="transition-colors hover:text-white" to="/app">
						Studio
					</Link>
					<a
						className="flex items-center gap-1.5 transition-colors hover:text-white"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						<GithubIcon />
						GitHub
					</a>
				</div>
			</div>
		</footer>
	);
}

/* ──────────── Helpers ──────────── */

function Reveal({
	children,
	className,
	delay = 0,
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 18 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-80px" }}
			transition={{ duration: 0.6, ease: EASE, delay }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

function SectionEyebrow({ children }: { children: ReactNode }) {
	return (
		<span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{children}</span>
	);
}

/* ──────────── Icons ──────────── */

function LogoGlyph({ small = false }: { small?: boolean }) {
	const s = small ? 13 : 15;
	return (
		<svg
			width={s}
			height={s}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Typelapse</title>
			<polyline points="9 8 5 12 9 16" />
			<polyline points="15 8 19 12 15 16" />
		</svg>
	);
}

function ArrowIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
			className="transition-transform group-hover:translate-x-0.5"
		>
			<title>Arrow</title>
			<path d="M5 12h14M13 6l6 6-6 6" />
		</svg>
	);
}

function GithubIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" role="img">
			<title>GitHub</title>
			<path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
		</svg>
	);
}

function MagicIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Magic move</title>
			<path d="M5 3v4M3 5h4M6 17v4M4 19h4" />
			<path d="M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
		</svg>
	);
}

function WysiwygIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>WYSIWYG</title>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

function AspectIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Aspect ratios</title>
			<rect x="3" y="6" width="12" height="12" rx="2" />
			<path d="M17 8h4v10a2 2 0 0 1-2 2H9" />
		</svg>
	);
}

function DropletIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Backgrounds</title>
			<path d="M12 2.5S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5z" />
		</svg>
	);
}

function PaletteIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Themes</title>
			<circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
			<circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
			<circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
			<circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
			<path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.5 1.8-1.5H16a6 6 0 0 0 6-6c0-4.4-4.5-8-10-8z" />
		</svg>
	);
}

function LoopIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Loop and typewriter</title>
			<path d="M17 2l4 4-4 4" />
			<path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
			<path d="M21 13v2a4 4 0 0 1-4 4H3" />
		</svg>
	);
}
