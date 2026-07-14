import { MESH_PRESETS } from "@/application/backgrounds/mesh-gradient";
import { Logomark } from "@/presentation/components/ui/logomark";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { StudioShowcase } from "./studio-showcase";

const GITHUB_URL = "https://github.com/delhombre/typelapse";
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const THEME_SWATCHES = [
	{ name: "aurora", bg: "#1a1b2e" },
	{ name: "midnight", bg: "#0d1117" },
	{ name: "dracula", bg: "#282a36" },
	{ name: "one-dark", bg: "#282c34" },
	{ name: "catppuccin", bg: "#1e1e2e" },
	{ name: "nord", bg: "#2e3440" },
];

/** Marketing landing at `/`. The product is the pitch: a real, live, playable studio. */
export function LandingPage() {
	return (
		<div className="dark relative flex min-h-dvh flex-col overflow-x-clip bg-[#08080d] font-sans text-neutral-300 antialiased">
			<Noise />
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
		<header className="sticky top-0 z-50 border-white/5 border-b bg-[#08080d]/60 backdrop-blur-xl">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
				<a href="/" className="flex items-center gap-2.5">
					<span className="flex size-7 items-center justify-center rounded-lg bg-white text-neutral-900">
						<Logomark size={16} />
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
					<Magnetic>
						<Link
							to="/app"
							className="flex h-9 items-center gap-1.5 rounded-xl bg-white px-4 font-semibold text-neutral-900 text-sm transition hover:bg-neutral-200"
						>
							Open studio
						</Link>
					</Magnetic>
				</div>
			</div>
		</header>
	);
}

/* ──────────── Hero ──────────── */

function Hero() {
	const [themeName, setThemeName] = useState("aurora");
	const [presetId, setPresetId] = useState("aurora");
	const accent = MESH_PRESETS.find((p) => p.id === presetId)?.accent ?? "#7c5cf0";

	return (
		<section className="relative isolate mx-auto w-full max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
			{/* Ambient glow — breathes, and takes the colour of the live background. */}
			<motion.div
				aria-hidden="true"
				className="-z-10 -translate-x-1/2 pointer-events-none absolute top-0 left-1/2 h-[460px] w-[880px] max-w-full rounded-full blur-[140px]"
				animate={{ opacity: [0.55, 0.8, 0.55], scale: [1, 1.06, 1] }}
				transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				style={{
					background: `radial-gradient(50% 60% at 50% 35%, ${accent}55, transparent 70%), radial-gradient(40% 50% at 68% 60%, ${accent}33, transparent 72%)`,
				}}
			/>

			<div className="mx-auto max-w-3xl text-center">
				<h1 className="font-bold text-5xl text-white leading-[1.02] tracking-tight sm:text-7xl">
					<RevealLine delay={0.04}>Your code,</RevealLine>
					<RevealLine delay={0.12}>in motion.</RevealLine>
				</h1>
				<motion.p
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}
					className="mx-auto mt-6 max-w-xl text-pretty text-lg text-neutral-400 leading-relaxed"
				>
					A studio that morphs snippets into video — token by token. The preview and the export run
					the same engine, so what you see is what you ship.
				</motion.p>
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, ease: EASE, delay: 0.38 }}
					className="mt-9 flex items-center justify-center gap-4"
				>
					<Magnetic>
						<Link
							to="/app"
							className="group flex h-12 items-center gap-2 rounded-2xl bg-accent px-6 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_30px_-8px_var(--color-accent)] transition hover:brightness-110"
						>
							Open the studio
							<ArrowIcon />
						</Link>
					</Magnetic>
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

			{/* The studio — live, tilts to the cursor, restyled in real time. */}
			<motion.div
				initial={{ opacity: 0, y: 36, filter: "blur(12px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				transition={{ duration: 1.1, ease: EASE, delay: 0.34 }}
				className="mx-auto mt-16 max-w-5xl"
			>
				<Tilt>
					<StudioShowcase themeName={themeName} presetId={presetId} />
				</Tilt>
			</motion.div>

			<Restyler
				presetId={presetId}
				themeName={themeName}
				onPreset={setPresetId}
				onTheme={setThemeName}
			/>

			<CapabilityStrip />
		</section>
	);
}

/* ──────────── Live restyler ──────────── */

function Restyler({
	presetId,
	themeName,
	onPreset,
	onTheme,
}: {
	presetId: string;
	themeName: string;
	onPreset: (id: string) => void;
	onTheme: (name: string) => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
			className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
		>
			<span className="font-mono text-[11px] text-neutral-500">restyle it live</span>
			<div className="flex items-center gap-2">
				{MESH_PRESETS.map((p) => (
					<Swatch
						key={p.id}
						group="bg"
						title={p.label}
						selected={presetId === p.id}
						onClick={() => onPreset(p.id)}
						preview={`linear-gradient(135deg, ${p.blobs[0]?.color ?? p.accent}, ${p.blobs[2]?.color ?? p.accent})`}
					/>
				))}
			</div>
			<span className="h-4 w-px bg-white/10" />
			<div className="flex items-center gap-2">
				{THEME_SWATCHES.map((t) => (
					<Swatch
						key={t.name}
						group="theme"
						title={t.name}
						selected={themeName === t.name}
						onClick={() => onTheme(t.name)}
						preview={t.bg}
						square
					/>
				))}
			</div>
		</motion.div>
	);
}

function Swatch({
	group,
	title,
	selected,
	onClick,
	preview,
	square = false,
}: {
	group: string;
	title: string;
	selected: boolean;
	onClick: () => void;
	preview: string;
	square?: boolean;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={{ scale: 1.18 }}
			whileTap={{ scale: 0.9 }}
			transition={{ type: "spring", stiffness: 400, damping: 22 }}
			className="relative flex items-center justify-center"
			title={title}
			aria-label={`${group} ${title}`}
		>
			{selected && (
				<motion.span
					layoutId={`swatch-ring-${group}`}
					className={`absolute size-6 ring-2 ring-white ${square ? "rounded-[7px]" : "rounded-full"}`}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}
			<span
				className={`size-4 border border-white/10 ${square ? "rounded-[5px]" : "rounded-full"}`}
				style={{ background: preview }}
			/>
		</motion.button>
	);
}

/* ──────────── Capabilities ──────────── */

const CAPABILITIES = [
	["Export", "MP4 · WebM · GIF · PNG"],
	["Aspect", "16:9 · 1:1 · 9:16 · 4:5 · 3:4"],
	["Look", "7 themes · 5 mono fonts · mesh backgrounds"],
	["Motion", "token morph · typewriter · seamless loop"],
];

function CapabilityStrip() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{ duration: 0.7, ease: EASE }}
			className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-x-8 gap-y-6 border-white/5 border-t pt-10 md:grid-cols-4"
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
						<Logomark size={13} />
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

/* ──────────── Motion helpers ──────────── */

/** A line that springs up from behind a mask on mount. */
function RevealLine({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
	return (
		<span className="block overflow-hidden pb-[0.12em]">
			<motion.span
				className="block"
				initial={{ y: "115%" }}
				animate={{ y: "0%" }}
				transition={{ duration: 1, ease: EASE, delay }}
			>
				{children}
			</motion.span>
		</span>
	);
}

/** Subtle 3D tilt toward the cursor; flattens on leave. Disabled for reduced motion. */
function Tilt({ children }: { children: ReactNode }) {
	const reduce = useReducedMotion();
	const rx = useSpring(0, { stiffness: 140, damping: 18 });
	const ry = useSpring(0, { stiffness: 140, damping: 18 });

	if (reduce) {
		return <>{children}</>;
	}

	return (
		<div
			style={{ perspective: 1400 }}
			onMouseMove={(e) => {
				const r = e.currentTarget.getBoundingClientRect();
				const px = (e.clientX - r.left) / r.width - 0.5;
				const py = (e.clientY - r.top) / r.height - 0.5;
				ry.set(px * 7);
				rx.set(-py * 5);
			}}
			onMouseLeave={() => {
				rx.set(0);
				ry.set(0);
			}}
		>
			<motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
				{children}
			</motion.div>
		</div>
	);
}

/** Nudges its child toward the cursor on hover. Disabled for reduced motion. */
function Magnetic({ children }: { children: ReactNode }) {
	const reduce = useReducedMotion();
	const x = useSpring(0, { stiffness: 200, damping: 15 });
	const y = useSpring(0, { stiffness: 200, damping: 15 });

	if (reduce) {
		return <>{children}</>;
	}

	return (
		<motion.div
			className="inline-flex"
			style={{ x, y }}
			onMouseMove={(e) => {
				const r = e.currentTarget.getBoundingClientRect();
				x.set((e.clientX - (r.left + r.width / 2)) * 0.25);
				y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
			}}
			onMouseLeave={() => {
				x.set(0);
				y.set(0);
			}}
		>
			{children}
		</motion.div>
	);
}

/** Faint film grain over the whole page — adds premium depth to the flat dark. */
function Noise() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-[100] opacity-[0.04] mix-blend-overlay"
			style={{
				backgroundImage:
					"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
			}}
		/>
	);
}

/* ──────────── Icons ──────────── */

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
