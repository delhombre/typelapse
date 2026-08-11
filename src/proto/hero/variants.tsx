import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

/* Desk, taken up to the dock's level.
   The flat version worked but read as a form sitting above a beautifully made
   control. The move is to stop treating them as two widgets: the field becomes
   the same object as the island below it, so the page reads as two islands with
   the frame held between them — input above, controls below.

   Everything material is borrowed rather than invented. The fill, the ink and
   the dim are the island's own `--dock-*` tokens, so the two can never drift
   apart; the selection is the island's gliding plate on one `layoutId`; the
   spring is the sampled ui.camera width spring with bounce left in it. Emil's
   rules do the rest: entrances ease out under 300ms and never fade from zero,
   the press scales to 0.97, the placeholder swap is masked with blur because
   nothing else bridges two strings cleanly, and no transition is `all`.

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

/** ui.camera's width spring, sampled: bounce left in, a short settle. */
const ISLAND_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;
/** The selection plate glides on the island's own curve. */
const PLATE_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

/** The entrance does not fade: sampled off ui.camera, it is a scale that
    overshoots from 0.996 to 1.0068 and settles. */
const rise = (reduce: boolean, delay: number) =>
	reduce
		? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2, delay } }
		: {
				initial: { opacity: 0.99, scale: 0.996, y: 6 },
				animate: { opacity: 1, scale: [0.996, 1.0068, 1] as number[], y: 0 },
				transition: {
					duration: 0.32,
					ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
					delay,
				},
			};

function Caret({ idle }: { idle: boolean }) {
	return <span className="proto-caret" data-idle={idle ? "" : undefined} aria-hidden="true" />;
}

function Examples({ tone }: { tone?: "dark" }) {
	return (
		<ul className="proto-examples" data-tone={tone}>
			{EXAMPLES.map(([url, meta]) => (
				<li key={url}>
					<Link to="/app">{url}</Link>
					<span>{meta}</span>
				</li>
			))}
		</ul>
	);
}

/* ═══════════ 1. Twin ═══════════
   The field is an island. Same fill, same pill, same rules as the dock below:
   every control transparent until hovered, the selection a gliding plate, and
   exactly one filled shape — the action. The frame is then held between two
   objects of the same family rather than floating under a form. */

export function Twin() {
	const reduce = useReducedMotion() ?? false;
	const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("pr");
	const [value, setValue] = useState("");
	const active = MODES.find((m) => m.id === mode) ?? MODES[0];

	return (
		<section className="proto-hero proto-twin">
			<div className="proto-twin-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-twin-lead">
							Turn a code change into a video. Paste a pull request, a diff or a snippet — it morphs
							token by token and renders for the feed.
						</p>
					</RevealItem>
				</RevealGroup>

				<motion.div className="proto-twin-island" {...rise(reduce, 0.08)}>
					{/* The modes: transparent until hovered, the active one wearing the
					    island's plate rather than a border. */}
					<div className="proto-twin-modes" role="tablist" aria-label="What you are pasting">
						{MODES.map((m) => (
							<button
								key={m.id}
								type="button"
								role="tab"
								aria-selected={m.id === mode}
								className="proto-twin-mode"
								onClick={() => setMode(m.id)}
							>
								{m.id === mode && (
									<motion.span
										layoutId="twin-plate"
										className="proto-twin-plate"
										transition={reduce ? { duration: 0 } : PLATE_SPRING}
									/>
								)}
								<span>{m.label}</span>
							</button>
						))}
					</div>

					<span className="proto-twin-sep" aria-hidden="true" />

					<label className="proto-twin-field">
						<span className="sr-only">Paste a {active.label}</span>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							spellCheck={false}
							aria-label={`Paste a ${active.label}`}
						/>
						{/* The placeholder is a layer, not an attribute: swapping strings on
						    a mode change needs a blur to bridge them, which an attribute
						    cannot animate. */}
						{value.length === 0 && (
							<AnimatePresence mode="wait" initial={false}>
								<motion.span
									key={active.id}
									className="proto-twin-hint"
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
						<Caret idle={value.length === 0} />
					</label>

					<motion.div whileTap={reduce ? undefined : { scale: 0.97 }} transition={ISLAND_SPRING}>
						<Link to="/app" className="proto-twin-go">
							Render
						</Link>
					</motion.div>
				</motion.div>

				<motion.div {...rise(reduce, 0.16)}>
					<Examples />
					<p className="proto-twin-meta">
						mp4 · webm · gif · png &nbsp;·&nbsp; MIT, runs on your machine &nbsp;·&nbsp;{" "}
						<a href={GITHUB_URL} target="_blank" rel="noreferrer">
							source
						</a>
					</p>
				</motion.div>
			</div>

			<Reveal immediate delay={0.26} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ═══════════ 2. Bench ═══════════
   The same craft rules on paper instead of on the dark: a raised white pill with
   the layered shadow the card system already uses, the plate in ink, and the
   action as the only filled shape. Kept as the counterweight — two dark islands
   stacked around a frame may be one dark object too many, and this answers that
   without giving up the material relationship. */

export function Bench() {
	const reduce = useReducedMotion() ?? false;
	const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("pr");
	const [value, setValue] = useState("");
	const active = MODES.find((m) => m.id === mode) ?? MODES[0];

	return (
		<section className="proto-hero proto-bench">
			<div className="proto-bench-col">
				<RevealGroup immediate>
					<RevealItem>
						<p className="proto-bench-lead">
							Turn a code change into a video. Paste a pull request, a diff or a snippet — it morphs
							token by token and renders for the feed.
						</p>
					</RevealItem>
				</RevealGroup>

				<motion.div className="proto-bench-island" {...rise(reduce, 0.08)}>
					<div className="proto-bench-modes" role="tablist" aria-label="What you are pasting">
						{MODES.map((m) => (
							<button
								key={m.id}
								type="button"
								role="tab"
								aria-selected={m.id === mode}
								className="proto-bench-mode"
								onClick={() => setMode(m.id)}
							>
								{m.id === mode && (
									<motion.span
										layoutId="bench-plate"
										className="proto-bench-plate"
										transition={reduce ? { duration: 0 } : PLATE_SPRING}
									/>
								)}
								<span>{m.label}</span>
							</button>
						))}
					</div>

					<span className="proto-bench-sep" aria-hidden="true" />

					<label className="proto-bench-field">
						<span className="sr-only">Paste a {active.label}</span>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							spellCheck={false}
							aria-label={`Paste a ${active.label}`}
						/>
						{value.length === 0 && (
							<AnimatePresence mode="wait" initial={false}>
								<motion.span
									key={active.id}
									className="proto-bench-hint"
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
						<Caret idle={value.length === 0} />
					</label>

					<motion.div whileTap={reduce ? undefined : { scale: 0.97 }} transition={ISLAND_SPRING}>
						<Link to="/app" className="proto-bench-go">
							Render
						</Link>
					</motion.div>
				</motion.div>

				<motion.div {...rise(reduce, 0.16)}>
					<Examples />
					<p className="proto-bench-meta">
						mp4 · webm · gif · png &nbsp;·&nbsp; MIT, runs on your machine &nbsp;·&nbsp;{" "}
						<a href={GITHUB_URL} target="_blank" rel="noreferrer">
							source
						</a>
					</p>
				</motion.div>
			</div>

			<Reveal immediate delay={0.26} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}
