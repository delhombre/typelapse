import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

/* Desk, reworked into our own shape.

   The field keeps what worked and gains the page's roundness: a 22px radius,
   and the mode buttons above are pills that begin exactly where that curve ends
   — inset by the radius itself, so the strip sits inside the arc instead of
   overhanging it. That inset is the whole trick; at 0 the buttons float over a
   corner and the two shapes read as unrelated.

   One rule for the two faces, applied throughout:
     Ioskeley Mono carries machine text — what you paste, the placeholder that
     shows the shape of it, the example repositories and their diffstats.
     Geist carries everything a human wrote: the claim, the labels, the spec.

   Throwaway. Delete src/proto and the route in main.tsx once it is settled. */

const EXAMPLES = [
	["github.com/oven-sh/bun/pull/14210", "3 files · +41 −12"],
	["github.com/vercel/next.js/pull/71102", "1 file · +18 −4"],
	["github.com/honojs/hono/pull/3488", "2 files · +26 −9"],
] as const;

const MODES = [
	{ id: "pr", label: "Pull request", hint: "https://github.com/owner/repo/pull/1247" },
	{ id: "diff", label: "Diff", hint: "@@ -1,6 +1,10 @@ export async function GET()" },
	{ id: "snippet", label: "Snippet", hint: "const users = await db.users.all()" },
] as const;

const PLATE_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;
const PRESS_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;

export function Desk() {
	const reduce = useReducedMotion() ?? false;
	const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("pr");
	const [value, setValue] = useState("");
	const active = MODES.find((m) => m.id === mode) ?? MODES[0];

	return (
		<section className="proto-hero">
			<div className="proto-col">
				<RevealGroup immediate>
					{/* ── Above: what a human wrote, so Geist. ── */}
					<RevealItem>
						<h1 className="proto-title">Your pull request, as a video</h1>
					</RevealItem>
					<RevealItem>
						<p className="proto-sub">
							Paste a link. Typelapse reads the diff, morphs it token by token, and renders a file
							the feed will take.
						</p>
					</RevealItem>

					{/* ── The object ── */}
					<RevealItem>
						<div className="proto-paste">
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
									<span className="sr-only">Paste a {active.label.toLowerCase()}</span>
									<input
										type="text"
										value={value}
										onChange={(e) => setValue(e.target.value)}
										spellCheck={false}
										aria-label={`Paste a ${active.label.toLowerCase()}`}
									/>
									{/* A layer rather than a placeholder attribute: swapping two
									    strings on a mode change needs a blur to bridge them, and an
									    attribute cannot animate. */}
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
									<span
										className="proto-caret"
										data-idle={value.length === 0 ? "" : undefined}
										aria-hidden="true"
									/>
								</label>

								<motion.div
									whileTap={reduce ? undefined : { scale: 0.97 }}
									transition={PRESS_SPRING}
								>
									<Link to="/app" className="proto-go">
										Render
									</Link>
								</motion.div>
							</div>
						</div>
					</RevealItem>

					{/* ── Below: the label is human, the rows are machine. ── */}
					<RevealItem>
						<div className="proto-log">
							<p className="proto-log-label">Or try one of these</p>
							<ul>
								{EXAMPLES.map(([url, meta]) => (
									<li key={url}>
										<Link to="/app">{url}</Link>
										<span>{meta}</span>
									</li>
								))}
							</ul>
						</div>
					</RevealItem>
					<RevealItem>
						<p className="proto-spec">
							Exports MP4, WebM, GIF and PNG · MIT licensed, runs on your machine ·{" "}
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								Source
							</a>
						</p>
					</RevealItem>
				</RevealGroup>
			</div>

			<Reveal immediate delay={0.28} className="mt-9">
				<Instrument />
			</Reveal>
		</section>
	);
}
