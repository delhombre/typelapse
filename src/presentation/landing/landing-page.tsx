import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { AnimatedSizeContainer } from "@/presentation/components/ui/animated-size-container";
import { Logomark } from "@/presentation/components/ui/logomark";
import { springs } from "@/presentation/motion";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StaticFrame } from "./static-frame";
import { StudioShowcase } from "./studio-showcase";

const GITHUB_URL = "https://github.com/delhombre/typelapse";
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Marketing landing at `/`. The product is the pitch: a real, live, playable studio. */
export function LandingPage() {
	return (
		<div className="dark relative flex min-h-dvh flex-col overflow-x-clip bg-[#08080d] font-sans text-neutral-300 antialiased">
			<Noise />
			<Nav />
			<main className="flex-1">
				<Hero />
				<Gallery />
				<Formats />
				<HowItWorks />
				<CtaSection />
			</main>
			<Footer />
		</div>
	);
}

/* ──────────── Nav ──────────── */

function Nav() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors ${
				scrolled ? "border-white/10 bg-[#08080d]/85" : "border-white/5 bg-[#08080d]/60"
			}`}
		>
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

/**
 * The whole pitch in eight characters: `your-code.ts` morphs into `your-code.mp4`.
 * The extension swaps on a timer; the pill's width springs between the two lengths.
 */
function PitchPill() {
	const reduce = useReducedMotion();
	const [ext, setExt] = useState("ts");

	useEffect(() => {
		if (reduce) {
			return;
		}
		const id = setInterval(() => {
			setExt((prev) => (prev === "ts" ? "mp4" : "ts"));
		}, 2400);
		return () => clearInterval(id);
	}, [reduce]);

	if (reduce) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8, ease: EASE }}
				className="mb-7 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 font-mono text-[12px] text-neutral-300"
			>
				<span>
					your-code.<span className="text-accent">ts</span>
				</span>
				<span className="text-neutral-600">→</span>
				<span>
					your-code.<span className="text-accent">mp4</span>
				</span>
			</motion.div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.8, ease: EASE }}
			className="mb-7 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 font-mono text-[12px] text-neutral-300"
		>
			<span>your-code.</span>
			<AnimatedSizeContainer
				width
				transition={springs.gentle}
				className="inline-block align-bottom"
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={ext}
						initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
						transition={{ duration: 0.45, ease: EASE }}
						className="inline-block text-accent"
					>
						{ext}
					</motion.span>
				</AnimatePresence>
			</AnimatedSizeContainer>
		</motion.div>
	);
}

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
				<PitchPill />
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

			{/* The studio — live, tilts to the cursor, restyled from its own chrome. */}
			<motion.div
				initial={{ opacity: 0, y: 36, filter: "blur(12px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				transition={{ duration: 1.1, ease: EASE, delay: 0.34 }}
				className="relative isolate mx-auto mt-16 max-w-5xl"
			>
				{/* Floor glow — an accent pool beneath the window, tracking the live background. */}
				<div
					aria-hidden="true"
					className="-z-10 -translate-x-1/2 pointer-events-none absolute -bottom-10 left-1/2 h-20 w-[72%] rounded-full opacity-25 blur-3xl"
					style={{ background: `radial-gradient(50% 100% at 50% 0%, ${accent}, transparent 70%)` }}
				/>
				<Tilt>
					<StudioShowcase
						themeName={themeName}
						presetId={presetId}
						onThemeChange={setThemeName}
						onPresetChange={setPresetId}
					/>
				</Tilt>
			</motion.div>

			<CapabilityStrip />
		</section>
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
		<>
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
			<motion.p
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true, margin: "-40px" }}
				transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
				className="mt-10 text-center font-mono text-[11px] text-neutral-500"
			>
				MIT licensed · runs locally · your code never leaves your machine
			</motion.p>
		</>
	);
}

/* ──────────── Gallery marquee ──────────── */

const GALLERY = [
	{
		themeName: "aurora",
		presetId: "aurora",
		language: "typescript",
		title: "api/users.ts",
		meshTime: 2,
		code: "export async function GET() {\n  return Response.json(users)\n}",
	},
	{
		themeName: "dracula",
		presetId: "nebula",
		language: "typescript",
		title: "store.ts",
		meshTime: 5,
		code: "export const useStore = create((set) => ({\n  count: 0,\n}))",
	},
	{
		themeName: "catppuccin",
		presetId: "ember",
		language: "python",
		title: "main.py",
		meshTime: 8,
		code: 'def greet(name: str) -> str:\n    msg = f"Hello, {name}"\n    return msg',
	},
	{
		themeName: "nord",
		presetId: "ocean",
		language: "typescript",
		title: "pipe.ts",
		meshTime: 11,
		code: "const result = pipe(\n  data, filter, map,\n)",
	},
	{
		themeName: "frost",
		presetId: "aurora",
		language: "json",
		title: "package.json",
		meshTime: 6,
		code: '{\n  "name": "typelapse"\n}',
	},
	{
		themeName: "one-dark",
		presetId: "forest",
		language: "typescript",
		title: "route.ts",
		meshTime: 14,
		code: 'app.get("/health", (c) =>\n  c.json({ ok: true })\n)',
	},
];

function Gallery() {
	return (
		<section className="py-24 sm:py-32">
			<div className="mx-auto w-full max-w-6xl px-6">
				<SectionHeader
					eyebrow="Beautiful by default"
					title="Every theme. Every backdrop."
					sub="Seven editor themes and animated mesh backgrounds — the same snippet, dressed however you like."
				/>
			</div>
			<div className="group relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]">
				<div className="flex w-max animate-marquee gap-5 [animation:marquee_55s_linear_infinite] group-hover:[animation-play-state:paused]">
					{[...GALLERY, ...GALLERY].map((g, i) => (
						<div key={`${g.title}-${i}`} className="w-[292px] shrink-0">
							<StaticFrame {...g} />
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

/* ──────────── Aspect-ratio formats ──────────── */

const FORMATS = [
	{
		themeName: "catppuccin",
		presetId: "ember",
		title: "reel.ts",
		badge: "9:16 · Reels & Shorts",
		className: "aspect-[9/16] w-[216px] max-w-full",
		meshTime: 4,
		fontSize: 11,
		framePadding: 16,
		code: "const reel =\n  clip.frames\n    .map(draw)\n    .render()",
	},
	{
		themeName: "dracula",
		presetId: "nebula",
		title: "post.ts",
		badge: "1:1 · X & LinkedIn",
		className: "aspect-square w-[286px] max-w-full",
		meshTime: 9,
		fontSize: 12,
		framePadding: 18,
		code: 'const post = snippet\n  .theme("dracula")\n  .png()',
	},
	{
		themeName: "nord",
		presetId: "ocean",
		title: "demo.ts",
		badge: "16:9 · YouTube & docs",
		className: "aspect-video w-[420px] max-w-full",
		meshTime: 13,
		fontSize: 13,
		framePadding: 20,
		code: "export const demo = render(\n  snippet, { fps: 60 },\n)",
	},
];

function Formats() {
	return (
		<section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
			<SectionHeader
				eyebrow="Made for every feed"
				title="One snippet. Every format."
				sub="Pick an aspect and the export ships ready for its platform — vertical reels, square posts, wide docs, all from the same snippet."
			/>
			<div className="mt-14 flex flex-wrap items-end justify-center gap-10">
				{FORMATS.map((f, i) => (
					<Reveal key={f.title} delay={i * 0.08}>
						<figure>
							<StaticFrame
								fill
								themeName={f.themeName}
								presetId={f.presetId}
								title={f.title}
								code={f.code}
								meshTime={f.meshTime}
								fontSize={f.fontSize}
								framePadding={f.framePadding}
								className={f.className}
							/>
							<figcaption className="mt-3 text-center font-mono text-[11px] text-neutral-500">
								{f.badge}
							</figcaption>
						</figure>
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
];

function HowItWorks() {
	return (
		<section className="border-white/5 border-y bg-white/[0.015]">
			<div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
				<SectionHeader eyebrow="Three steps" title="Snippet to video in a minute." />
				<div className="mt-14 grid gap-10 md:grid-cols-3">
					{STEPS.map((s, i) => (
						<Reveal key={s.n} delay={i * 0.08}>
							<span className="font-mono text-accent text-sm">{s.n}</span>
							<div className="mt-3 h-px w-full bg-gradient-to-r from-white/15 to-transparent" />
							<h3 className="mt-5 font-semibold text-lg text-white">{s.title}</h3>
							<p className="mt-2 text-pretty text-neutral-400 text-sm leading-relaxed">{s.body}</p>
							<StepProp n={s.n} />
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}

/**
 * A small product-vocabulary prop under each step — the actual thing that step
 * produces: typed code with a caret, the captured steps, the exported file.
 */
function StepProp({ n }: { n: string }) {
	const reduce = useReducedMotion();

	if (n === "01") {
		return (
			<div
				aria-hidden="true"
				className="mt-4 inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-neutral-400"
			>
				<span>{"function greet() {"}</span>
				<motion.span
					className="inline-block h-3 w-0.5 rounded-full bg-accent"
					animate={reduce ? undefined : { opacity: [1, 0, 1] }}
					transition={reduce ? undefined : { duration: 1.1, repeat: Number.POSITIVE_INFINITY }}
				/>
			</div>
		);
	}

	if (n === "02") {
		return (
			<div aria-hidden="true" className="mt-4 flex items-center gap-2">
				{["01", "02", "03"].map((c) => (
					<span
						key={c}
						className={`flex h-7 items-center rounded-lg border px-2.5 font-mono text-[11px] tabular-nums ${
							c === "02"
								? "border-accent/40 bg-accent/15 text-accent"
								: "border-white/10 bg-white/[0.02] text-neutral-500"
						}`}
					>
						{c}
					</span>
				))}
			</div>
		);
	}

	return (
		<div
			aria-hidden="true"
			className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-neutral-400"
		>
			<span>demo.mp4</span>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				role="img"
			>
				<title>Download</title>
				<path d="M12 5v14M6 13l6 6 6-6" />
			</svg>
		</div>
	);
}

/* ──────────── Final CTA ──────────── */

function CtaSection() {
	const aurora = MESH_PRESETS.find((p) => p.id === "aurora");
	return (
		<section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
			<Reveal className="relative isolate overflow-hidden rounded-[32px] border border-white/10 px-6 py-20 text-center">
				{/* The product's own mesh — the CTA sits on the very thing it sells. */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{ background: aurora ? meshGradientCss(aurora, 6) : undefined }}
				/>
				<GrainOverlay />
				<div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#08080d]/70" />
				<div className="relative z-10">
					<h2 className="mx-auto max-w-2xl text-balance font-bold text-4xl text-white tracking-tight sm:text-5xl">
						Make your code move.
					</h2>
					<p className="mx-auto mt-4 max-w-md text-pretty text-neutral-300">
						Open the studio and export your first animation in under a minute — no account needed.
					</p>
					<div className="mt-8 flex justify-center">
						<Magnetic>
							<Link
								to="/app"
								className="group flex h-12 items-center gap-2 rounded-2xl bg-accent px-7 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_30px_-8px_var(--color-accent)] transition hover:brightness-110"
							>
								Open the studio
								<ArrowIcon />
							</Link>
						</Magnetic>
					</div>
				</div>
			</Reveal>
		</section>
	);
}

function SectionHeader({
	eyebrow,
	title,
	sub,
}: {
	eyebrow: string;
	title: string;
	sub?: string;
}) {
	return (
		<Reveal className="mx-auto max-w-2xl text-center">
			<span className="font-mono text-[11px] text-accent uppercase tracking-[0.2em]">
				{eyebrow}
			</span>
			<h2 className="mt-4 text-balance font-bold text-3xl text-white tracking-tight sm:text-4xl">
				{title}
			</h2>
			{sub && <p className="mt-4 text-pretty text-neutral-400 leading-relaxed">{sub}</p>}
		</Reveal>
	);
}

/* ──────────── Footer ──────────── */

function Footer() {
	return (
		<footer className="border-white/5 border-t">
			<div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-6 py-14 md:grid-cols-4">
				<div className="col-span-2 md:col-span-2">
					<div className="flex items-center gap-2.5">
						<span className="flex size-7 items-center justify-center rounded-lg bg-white text-neutral-900">
							<Logomark size={16} />
						</span>
						<span className="font-semibold text-sm text-white">Typelapse</span>
					</div>
					<p className="mt-4 max-w-xs text-pretty text-neutral-500 text-sm leading-relaxed">
						A timelapse for your code. Morph snippets into video — free and open source.
					</p>
				</div>
				<FooterCol title="Product">
					<FooterLink to="/app">Studio</FooterLink>
					<FooterAnchor href={`${GITHUB_URL}#readme`}>Docs</FooterAnchor>
				</FooterCol>
				<FooterCol title="Project">
					<FooterAnchor href={GITHUB_URL}>GitHub</FooterAnchor>
					<FooterAnchor href={`${GITHUB_URL}/issues`}>Issues</FooterAnchor>
				</FooterCol>
			</div>
			<div className="border-white/5 border-t">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
					<span className="font-mono text-neutral-600 text-xs">timelapse for code</span>
					<span className="font-mono text-neutral-600 text-xs">free &amp; open source</span>
				</div>
			</div>
		</footer>
	);
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-3">
			<span className="font-medium text-neutral-500 text-xs uppercase tracking-wider">{title}</span>
			{children}
		</div>
	);
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
	return (
		<Link className="text-neutral-400 text-sm transition-colors hover:text-white" to={to}>
			{children}
		</Link>
	);
}

function FooterAnchor({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			className="text-neutral-400 text-sm transition-colors hover:text-white"
			href={href}
			target="_blank"
			rel="noreferrer"
		>
			{children}
		</a>
	);
}

/* ──────────── Motion helpers ──────────── */

/** Fades + lifts its children in when scrolled into view (once). */
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
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-80px" }}
			transition={{ duration: 0.7, ease: EASE, delay }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

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
