import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

/* Desk's field, kept — three text treatments around it.

   The field was the part that worked, so it is now one shared component and
   identical in all three: only restyled into our own tokens (warm surface, our
   hairline, our accent) and given the island's craft rules — the selection is a
   gliding plate rather than a border, controls are transparent until hovered,
   the action is the only filled shape, and the radii are concentric.

   What varies is the typography, which was the actual problem: the whole hero
   was mono at 13px in one grey, one size, one register, so nothing had rank.

   One rule governs the two faces, and it is not negotiable per variant:

     Ioskeley Mono is a *code* face. It carries machine text only — the URL or
     diff you paste, the example repositories and their diffstats, an inline
     fragment quoted from a command. Geist carries everything a human wrote,
     the headline included.

   Setting a 52px headline in the code face was the flat version's other
   mistake: it makes the sentence look like output when it is a claim, and it
   spends the one face that should mean "this is literally your code".

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const EXAMPLES = [
	["github.com/oven-sh/bun/pull/14210", "3 files · +41 −12"],
	["github.com/vercel/next.js/pull/71102", "1 file · +18 −4"],
	["github.com/honojs/hono/pull/3488", "2 files · +26 −9"],
] as const;

const MODES = [
	{ id: "pr", label: "pull request", hint: "https://github.com/owner/repo/pull/1247" },
	{ id: "diff", label: "diff", hint: "@@ -1,6 +1,10 @@" },
	{ id: "snippet", label: "snippet", hint: "const users = await db.users.all()" },
] as const;

const PLATE_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;
const PRESS_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;

/** The field, unchanged across the three — the part that already worked. */
function PasteField() {
	const reduce = useReducedMotion() ?? false;
	const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("pr");
	const [value, setValue] = useState("");
	const active = MODES.find((m) => m.id === mode) ?? MODES[0];

	return (
		<div className="proto-field-wrap">
			<div className="proto-modes" role="tablist" aria-label="What you are pasting">
				{MODES.map((m) => (
					<button
						key={m.id}
						type="button"
						role="tab"
						aria-selected={m.id === mode}
						className="proto-mode"
						onClick={() => setMode(m.id)}
					>
						{m.id === mode && (
							<motion.span
								layoutId="proto-plate"
								className="proto-plate"
								transition={reduce ? { duration: 0 } : PLATE_SPRING}
							/>
						)}
						<span>{m.label}</span>
					</button>
				))}
			</div>

			<div className="proto-field">
				<label className="proto-field-inner">
					<span className="sr-only">Paste a {active.label}</span>
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						spellCheck={false}
						aria-label={`Paste a ${active.label}`}
					/>
					{/* A layer, not a placeholder attribute: swapping two strings on a mode
					    change needs a blur to bridge them, and an attribute cannot animate. */}
					{value.length === 0 && (
						<AnimatePresence mode="wait" initial={false}>
							<motion.span
								key={active.id}
								className="proto-hint"
								initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(3px)" }}
								animate={{ opacity: 1, filter: "blur(0px)" }}
								exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(3px)" }}
								transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
								aria-hidden="true"
							>
								{active.hint}
							</motion.span>
						</AnimatePresence>
					)}
					<span className="proto-caret" data-idle={value.length === 0 ? "" : undefined} />
				</label>

				<motion.div whileTap={reduce ? undefined : { scale: 0.97 }} transition={PRESS_SPRING}>
					<Link to="/app" className="proto-go">
						Render
					</Link>
				</motion.div>
			</div>
		</div>
	);
}

/** The example log: a mono eyebrow, then rows whose numbers align. */
function Log({ label = "Try one" }: { label?: string }) {
	return (
		<div className="proto-log">
			<p className="proto-log-label">{label}</p>
			<ul>
				{EXAMPLES.map(([url, meta]) => (
					<li key={url}>
						<Link to="/app">{url}</Link>
						<span>{meta}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function Spec({ children }: { children?: ReactNode }) {
	return (
		<p className="lp-micro proto-spec">
			{children}
			mp4 · webm · gif · png &nbsp;·&nbsp; MIT, runs on your machine &nbsp;·&nbsp;{" "}
			<a href={GITHUB_URL} target="_blank" rel="noreferrer">
				source
			</a>
		</p>
	);
}

/* ═══════════ 1. Statement ═══════════
   The claim comes back, in the landing's own display mono, and the field sits
   directly under it as the answer. Three registers doing three jobs: the mono
   display states, the sans explains, small mono handles the machine. This is the
   page's existing type system, simply applied — the flat version used none of
   it. */

export function Statement() {
	return (
		<section className="proto-hero proto-statement">
			<div className="proto-col">
				<RevealGroup immediate>
					<RevealItem>
						<h1 className="proto-title">Your pull request, as a video</h1>
					</RevealItem>
					<RevealItem>
						<p className="lp-lead proto-sub">
							Paste it below. Typelapse morphs the diff token by token and renders a file the feed
							will take.
						</p>
					</RevealItem>
					<RevealItem>
						<PasteField />
					</RevealItem>
					<RevealItem>
						<Log />
					</RevealItem>
					<RevealItem>
						<Spec />
					</RevealItem>
				</RevealGroup>
			</div>
			<Reveal immediate delay={0.28} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 2. Duet ═══════════
   The two faces play against each other on one line rather than in two blocks:
   the sentence starts in the sans and lands on `--from-pr 1247` in the mono, so
   the typeface change *is* the emphasis. Pairing for contrast rather than for
   similarity, which is the rule the flat version broke by setting everything in
   one face at one size. */

export function Duet() {
	return (
		<section className="proto-hero proto-duet">
			<div className="proto-col">
				<RevealGroup immediate>
					<RevealItem>
						<h1 className="proto-duet-title">
							Turn <span className="proto-duet-mono">--from-pr 1247</span>
							<br />
							into something people watch.
						</h1>
					</RevealItem>
					<RevealItem>
						<p className="lp-lead proto-sub">
							One engine morphs the diff and renders the export, so the preview is the file.
						</p>
					</RevealItem>
					<RevealItem>
						<PasteField />
					</RevealItem>
					<RevealItem>
						<Log label="Recent" />
					</RevealItem>
					<RevealItem>
						<Spec />
					</RevealItem>
				</RevealGroup>
			</div>
			<Reveal immediate delay={0.28} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 3. Caption ═══════════
   The weight moves under the field. The top is a quiet instruction — the field
   is the first thing you meet, not a claim about it — and the display line sits
   below, captioning the object it introduces the way a plate is labelled in a
   catalogue. The most confident of the three, and the only one where the biggest
   type is not the first thing read. */

export function Caption() {
	return (
		<section className="proto-hero proto-caption">
			<div className="proto-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="lp-eyebrow proto-caption-eyebrow">Paste a change</p>
					</RevealItem>
					<RevealItem>
						<PasteField />
					</RevealItem>
					<RevealItem>
						<Log />
					</RevealItem>
					<RevealItem>
						<h1 className="proto-caption-title">
							…and get a video of it, <span className="proto-code">token by token</span>.
						</h1>
					</RevealItem>
					<RevealItem>
						<Spec />
					</RevealItem>
				</RevealGroup>
			</div>
			<Reveal immediate delay={0.28} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}
