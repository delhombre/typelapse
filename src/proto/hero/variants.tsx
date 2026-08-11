import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { CONTAINER, GITHUB_URL } from "@/presentation/landing/tokens";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";

/* Five heroes, one fixed head.
   The eyebrow and the mono headline are the part that works — the Terminal
   direction, and the `--from-pr 1247` line the whole page now follows — so they
   are identical in all five and never move. What varies is everything under
   them: whether the lead is prose at all, what the calls to action look like,
   and how the instrument arrives.

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const HEADLINE = "Your pull request, as a video";
const PROMPT = "typelapse --from-pr 1247";
const MICRO = "MIT licensed. Runs on your machine. No account needed.";

/** The fixed head, byte for byte what ships today. */
function Head() {
	return (
		<>
			<RevealItem>
				<p className="lp-prompt mb-5">
					<span aria-hidden="true">$ </span>
					{PROMPT}
				</p>
			</RevealItem>
			<RevealItem>
				<h1 className="lp-display-mono max-w-[30ch] text-ink">{HEADLINE}</h1>
			</RevealItem>
		</>
	);
}

function PrimaryPair() {
	return (
		<div className="mt-6 flex flex-wrap gap-3">
			<Link
				to="/app"
				className="inline-flex items-center rounded-[10px] bg-ink px-5 py-3 font-semibold text-[0.875rem] text-paper transition-opacity hover:opacity-88"
			>
				Open the studio
			</Link>
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noreferrer"
				className="inline-flex items-center rounded-[10px] px-5 py-3 font-semibold text-[0.875rem] text-ink shadow-[inset_0_0_0_1px_currentColor]/10 transition-colors hover:bg-ink/5"
			>
				View source
			</a>
		</div>
	);
}

/* ═══════════ 0. Current ═══════════
   What ships today, kept in the set so the four alternatives have the
   incumbent to beat rather than a memory of it. */

export function Current() {
	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className={CONTAINER}>
				<Head />
				<RevealItem>
					<p className="lp-lead mt-4 max-w-[58ch]">
						Paste a snippet, a unified diff, or a whole GitHub pull request. Typelapse morphs it
						token by token and exports a video that matches the preview frame for frame.
					</p>
				</RevealItem>
				<RevealItem>
					<PrimaryPair />
				</RevealItem>
			</RevealGroup>
			<Reveal immediate delay={0.24} className="mt-7">
				<Instrument />
			</Reveal>
			<Reveal immediate delay={0.32} className={`${CONTAINER} mt-4`}>
				<p className="lp-micro">{MICRO}</p>
			</Reveal>
		</section>
	);
}

/* ═══════════ 1. Output ═══════════
   The lead stops being prose and becomes what the command actually printed:
   three dim mono lines, the shell answering the prompt above them. It reads as
   a session rather than as marketing, which is the promise the eyebrow already
   makes, and it takes four lines where the paragraph took three at twice the
   width. The buttons go, because the dock below already holds Open studio. */

const OUTPUT = [
	{ tone: "dim", text: "reading 3 changed files · 41 additions · 12 deletions" },
	{ tone: "dim", text: "windowing the diff into 4 steps" },
	{ tone: "ok", text: "rendered users.mp4 · 1920×1080 · 12s" },
];

export function Output() {
	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className={CONTAINER}>
				<Head />
				<RevealItem>
					<div className="proto-output mt-5">
						{OUTPUT.map((l) => (
							<p key={l.text} className="proto-output-line" data-tone={l.tone}>
								{l.text}
							</p>
						))}
					</div>
				</RevealItem>
			</RevealGroup>
			<Reveal immediate delay={0.24} className="mt-8">
				<Instrument />
			</Reveal>
			<Reveal immediate delay={0.32} className={`${CONTAINER} mt-4`}>
				<p className="lp-micro">{MICRO}</p>
			</Reveal>
		</section>
	);
}

/* ═══════════ 2. Ledger ═══════════
   The paragraph becomes the page's own thread, stated once at the top: paste,
   morph, ship, as three short spec lines on a hairline. A visitor reads the
   whole product in four seconds and then meets the four sections that expand
   each line, so the hero indexes the page instead of summarising it. */

const STEPS: [string, string][] = [
	["Paste", "a snippet, a unified diff, or a GitHub pull request URL"],
	["Morph", "token by token, on the same engine the export runs"],
	["Ship", "MP4, WebM, GIF or PNG, in every aspect the feeds ask for"],
];

export function Ledger() {
	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className={CONTAINER}>
				<Head />
				<RevealItem>
					<dl className="proto-steps mt-6">
						{STEPS.map(([term, detail]) => (
							<div key={term} className="proto-step">
								<dt>{term}</dt>
								<dd>{detail}</dd>
							</div>
						))}
					</dl>
				</RevealItem>
				<RevealItem>
					<PrimaryPair />
				</RevealItem>
			</RevealGroup>
			<Reveal immediate delay={0.26} className="mt-7">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 3. Silent ═══════════
   Everything under the headline goes. No lead, no button row: one short line of
   consequence, then the object, which already carries Open studio in its dock.
   The most confident version and the shortest path to the product — it works
   only if the instrument can carry the whole argument alone. */

export function Silent() {
	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<RevealGroup immediate className={CONTAINER}>
				<Head />
				<RevealItem>
					<p className="lp-lead mt-4 max-w-[42ch]">
						One engine draws the preview and the export, so what you see below is the file you ship.
					</p>
				</RevealItem>
			</RevealGroup>
			<Reveal immediate delay={0.22} className="mt-9">
				<Instrument maxScale={1.12} />
			</Reveal>
			<Reveal immediate delay={0.3} className={`${CONTAINER} mt-4`}>
				<p className="lp-micro">{MICRO}</p>
			</Reveal>
		</section>
	);
}

/* ═══════════ 4. Aside ═══════════
   The head keeps the left column on its own, and the lead, the actions and the
   footnote move to a narrow right column beside it. The two-column head gives
   the instrument the full width underneath without the copy having to shrink,
   and it stops the hero reading as one centred stack of four things. */

export function Aside() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<div className={CONTAINER}>
				<div className="proto-aside">
					<RevealGroup immediate>
						<Head />
					</RevealGroup>
					<motion.div
						className="proto-aside-col"
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: reduce ? 0.2 : 0.5, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
					>
						<p className="lp-lead">
							Typelapse morphs your change token by token and exports a video that matches the
							preview frame for frame.
						</p>
						<PrimaryPair />
						<p className="lp-micro mt-5">{MICRO}</p>
					</motion.div>
				</div>
			</div>
			<Reveal immediate delay={0.26} className="mt-8">
				<Instrument />
			</Reveal>
		</section>
	);
}
