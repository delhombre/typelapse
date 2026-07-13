import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { StudioShowcase } from "./studio-showcase";

const GITHUB_URL = "https://github.com/delhombre/typelapse";
const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Marketing landing at `/`. The product is the pitch: a real, live studio shot. */
export function LandingPage() {
	return (
		<div className="dark relative flex min-h-dvh flex-col overflow-x-clip bg-[#08080d] font-sans text-neutral-300 antialiased">
			<Nav />
			<main className="flex-1">
				<Hero />
			</main>
			<Footer />
		</div>
	);
}

/* ──────────── Nav ──────────── */

function Nav() {
	return (
		<header className="sticky top-0 z-50 border-white/5 border-b bg-[#08080d]/70 backdrop-blur-xl">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<a href="/" className="flex items-center gap-2.5">
					<span className="flex size-7 items-center justify-center rounded-lg bg-white text-neutral-900">
						<LogoGlyph />
					</span>
					<span className="font-semibold text-sm text-white tracking-tight">Typelapse</span>
				</a>
				<div className="flex items-center gap-2">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="flex size-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
						title="GitHub"
					>
						<GithubIcon />
					</a>
					<Link
						to="/app"
						className="flex h-9 items-center gap-1.5 rounded-xl bg-white px-4 font-semibold text-neutral-900 text-sm transition hover:bg-neutral-200"
					>
						Open studio
					</Link>
				</div>
			</div>
		</header>
	);
}

/* ──────────── Hero ──────────── */

function Hero() {
	return (
		<section className="relative isolate mx-auto w-full max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
			<div
				aria-hidden="true"
				className="-z-10 -translate-x-1/2 pointer-events-none absolute top-0 left-1/2 h-[420px] w-[820px] max-w-full blur-[130px]"
				style={{
					background:
						"radial-gradient(50% 60% at 50% 30%, rgba(124,92,246,0.22), transparent 72%), radial-gradient(40% 50% at 70% 60%, rgba(6,182,212,0.12), transparent 72%)",
				}}
			/>

			<div className="mx-auto max-w-3xl text-center">
				<motion.h1
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE }}
					className="text-balance font-bold text-4xl text-white leading-[1.08] tracking-tight sm:text-6xl"
				>
					Your code, in motion.
				</motion.h1>
				<motion.p
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
					className="mx-auto mt-5 max-w-xl text-pretty text-lg text-neutral-400 leading-relaxed"
				>
					A studio that morphs snippets into video — token by token. The preview and the export run
					the same engine, so what you see is what you ship.
				</motion.p>
				<motion.div
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.16 }}
					className="mt-8 flex items-center justify-center gap-4"
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
						className="font-medium text-neutral-300 text-sm underline-offset-4 transition-colors hover:text-white hover:underline"
					>
						View on GitHub
					</a>
				</motion.div>
			</div>

			{/* The studio — live. */}
			<motion.div
				initial={{ opacity: 0, y: 32, filter: "blur(10px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				transition={{ duration: 1, ease: EASE, delay: 0.2 }}
				className="mx-auto mt-16 max-w-5xl"
			>
				<StudioShowcase />
			</motion.div>

			<CapabilityStrip />
		</section>
	);
}

/* ──────────── Capabilities (factual, not a bento) ──────────── */

const CAPABILITIES = [
	["Export", "MP4 · WebM · GIF · PNG"],
	["Aspect", "16:9 · 1:1 · 9:16 · 4:5 · 3:4"],
	["Look", "7 themes · 5 mono fonts · mesh backgrounds"],
	["Motion", "token morph · typewriter · seamless loop"],
];

function CapabilityStrip() {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.6, ease: EASE }}
			className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-x-8 gap-y-6 border-white/5 border-t pt-10 md:grid-cols-4"
		>
			{CAPABILITIES.map(([label, value]) => (
				<div key={label}>
					<div className="font-mono text-[10px] text-accent uppercase tracking-[0.18em]">
						{label}
					</div>
					<div className="mt-1.5 text-neutral-300 text-sm leading-relaxed">{value}</div>
				</div>
			))}
		</motion.div>
	);
}

/* ──────────── Footer ──────────── */

function Footer() {
	return (
		<footer className="border-white/5 border-t">
			<div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
				<div className="flex items-center gap-2.5">
					<span className="flex size-6 items-center justify-center rounded-md bg-white text-neutral-900">
						<LogoGlyph small />
					</span>
					<span className="font-semibold text-sm text-white">Typelapse</span>
					<span className="ml-2 font-mono text-neutral-600 text-xs">timelapse for code</span>
				</div>
				<div className="flex items-center gap-6 text-neutral-400 text-sm">
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
					<span className="font-mono text-neutral-600 text-xs">free &amp; open source</span>
				</div>
			</div>
		</footer>
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
