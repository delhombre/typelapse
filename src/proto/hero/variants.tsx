import { Theme } from "@/domain/entities/theme";
import { Instrument } from "@/presentation/landing/instrument";
import { Reveal, RevealGroup, RevealItem } from "@/presentation/landing/primitives";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EngineFrames } from "./engine-frames";

/* Four hero directions, all running the real Instrument on the real palette.
   None of this ships: the point is to judge compositions side by side at full
   size, on hostile content, rather than argue about them in prose. */

const HEADLINE = "Your pull request, as a video";
const LEAD =
	"Paste a snippet, a unified diff, or a whole GitHub pull request. Typelapse morphs it token by token and exports a video that matches the preview frame for frame.";
const MICRO = "MIT licensed. Runs on your machine. No account needed.";

/* The engine morphs between these. Written so the shared tokens actually glide:
   `pull` and `request` survive from the command into the sentence, which is what
   makes the morph read as a translation rather than a crossfade. */
const SENTENCE_FRAMES = [
	"typelapse --from pull request 1247",
	"typelapse turns a pull request into a video",
	"Your pull request, as a video",
];
const SENTENCE_HOLDS = [1500, 1700, 2600, 900];

function PrimaryCta() {
	return (
		<Link
			to="/app"
			className="inline-flex items-center rounded-[10px] bg-ink px-5 py-3 font-semibold text-[0.875rem] text-paper transition-opacity hover:opacity-88"
		>
			Open the studio
		</Link>
	);
}

function SecondaryCta() {
	return (
		<a
			href={GITHUB_URL}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center rounded-[10px] px-5 py-3 font-semibold text-[0.875rem] text-ink shadow-[inset_0_0_0_1px_currentColor]/10 transition-colors hover:bg-ink/5"
		>
			View source
		</a>
	);
}

/* ───────────────────── 1. Sentence ─────────────────────
   The headline is not typeset, it is *rendered by the product*. The same
   magic-move engine that makes the videos morphs the shell command into the
   claim, token by token, so the first motion a visitor sees is the feature
   itself operating on the marketing copy. No competitor can copy this hero
   without building the engine first. */

export function Sentence() {
	// A light-background theme, because these tokens paint straight onto the page
	// rather than into a card: a dark theme's foreground would be invisible here.
	const theme = Theme.frost();

	return (
		<section
			className="proto-hero flex min-h-[100svh] flex-col justify-center py-8"
			style={{ "--hero-chrome": "372px", "--stage-max": "420px" } as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1100px] px-6">
				<Reveal immediate>
					<p className="lp-prompt mb-4">
						<span aria-hidden="true">$ </span>the headline below is rendered by the engine, live
					</p>
					<div className="proto-sentence">
						<EngineFrames
							frames={SENTENCE_FRAMES}
							holds={SENTENCE_HOLDS}
							theme={theme}
							// Tokenized as TypeScript, which is what makes the morph work at all:
							// plain text comes back as one token per line and can only
							// crossfade, while this gives every word its own token to glide
							// with. The sentence is deliberately written to tokenize.
							language="typescript"
							fontSize={34}
							lineHeightRatio={1.28}
							ariaLabel="A shell command morphing token by token into the sentence: your pull request, as a video"
						/>
					</div>
				</Reveal>
			</div>

			<Reveal immediate delay={0.3} className="mt-8">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ───────────────────────── 2. Split ─────────────────────────
   Argument left, artefact right. Buys back every pixel the stacked hero spends
   on vertical rhythm, which is what lets the copy keep its lead and its two
   buttons and still leave the instrument a full-size frame. */

export function Split() {
	return (
		<section
			className="proto-hero flex min-h-[100svh] items-center py-8"
			style={{ "--hero-chrome": "168px", "--stage-max": "480px" } as React.CSSProperties}
		>
			<div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-10 px-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-14">
				<RevealGroup immediate>
					<RevealItem>
						<p className="lp-prompt mb-5">
							<span aria-hidden="true">$ </span>typelapse --from-pr 1247
						</p>
					</RevealItem>
					<RevealItem>
						<h1 className="lp-display-mono max-w-[16ch] text-ink">{HEADLINE}</h1>
					</RevealItem>
					<RevealItem>
						<p className="lp-lead mt-5 max-w-[46ch]">{LEAD}</p>
					</RevealItem>
					<RevealItem>
						<div className="mt-7 flex flex-wrap gap-3">
							<PrimaryCta />
							<SecondaryCta />
						</div>
					</RevealItem>
					<RevealItem>
						<p className="lp-micro mt-7">{MICRO}</p>
					</RevealItem>
				</RevealGroup>

				<Reveal immediate delay={0.24} className="proto-split-artefact">
					<Instrument />
				</Reveal>
			</div>
		</section>
	);
}

/* ───────────────────── 3. Console ─────────────────────
   The Terminal direction played all the way out: the hero is a session. The
   command types itself, the copy arrives as the program's output, and the
   instrument is what the command returned. */

const OUTPUT_LINES = [
	{ tone: "dim", text: "reading 3 changed files, 41 additions, 12 deletions" },
	{ tone: "dim", text: "windowing the diff into 4 steps" },
	{ tone: "ok", text: "rendered users.mp4 — 1920×1080, 12s" },
];

/** Types a string out character by character. Local to the proto: if Console
    wins, this becomes the typewriter the engine already ships. */
function useTypedText(text: string, msPerChar: number, startDelay: number) {
	const reduce = useReducedMotion();
	const [count, setCount] = useState(reduce ? text.length : 0);

	useEffect(() => {
		if (reduce) {
			setCount(text.length);
			return;
		}
		setCount(0);
		let timer = 0;
		const start = window.setTimeout(() => {
			timer = window.setInterval(() => {
				setCount((c) => {
					if (c >= text.length) {
						window.clearInterval(timer);
						return c;
					}
					return c + 1;
				});
			}, msPerChar);
		}, startDelay);
		return () => {
			window.clearTimeout(start);
			window.clearInterval(timer);
		};
	}, [text, msPerChar, startDelay, reduce]);

	return { shown: text.slice(0, count), done: count >= text.length };
}

export function Console() {
	const reduce = useReducedMotion();
	const command = "typelapse --from-pr github.com/acme/api/pull/1247";
	const { shown, done } = useTypedText(command, 26, 420);

	return (
		<section
			className="proto-hero flex min-h-[100svh] flex-col justify-center py-8"
			style={{ "--hero-chrome": "382px", "--stage-max": "440px" } as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1100px] px-6">
				<Reveal immediate>
					<div className="proto-console">
						<p className="proto-console-line">
							<span className="proto-console-prompt" aria-hidden="true">
								$
							</span>
							<span>{shown}</span>
							{!done && <span className="proto-console-caret" aria-hidden="true" />}
						</p>

						{done &&
							OUTPUT_LINES.map((line, i) => (
								<motion.p
									key={line.text}
									className="proto-console-line"
									data-tone={line.tone}
									initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.11 }}
								>
									{line.text}
								</motion.p>
							))}

						{done && (
							<motion.h1
								className="lp-display-mono proto-console-headline max-w-[26ch] text-ink"
								initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.34, delay: reduce ? 0 : 0.42 }}
							>
								{HEADLINE}
							</motion.h1>
						)}
					</div>
				</Reveal>
			</div>

			<Reveal immediate delay={0.24} className="mt-7">
				<Instrument />
			</Reveal>
		</section>
	);
}

/* ────────────────── 4. Continuum ──────────────────
   One object, not two. The frame opens on a real diff and the diff *becomes*
   its result in a single continuous move: the removed line fades, the added
   lines glide into place, the +/- signs drop away. The product's whole promise
   happens once, in front of you, without an arrow between two pictures
   explaining that it would. */

const CONTINUUM_FRAMES = [
	`- return db.users.all()
+ const users = await db.users.all()
+ return Response.json(users)`,
	`const users = await db.users.all()
return Response.json(users)`,
	`const users = await db.users.all()
const active = users.filter((u) => u.active)
return Response.json(active)`,
];
const CONTINUUM_HOLDS = [2100, 1500, 2400, 1000];

export function Continuum() {
	const theme = Theme.midnight();

	return (
		<section className="proto-hero flex min-h-[100svh] flex-col justify-center py-8">
			<div className="mx-auto w-full max-w-[1100px] px-6">
				<RevealGroup immediate>
					<RevealItem>
						<p className="lp-prompt mb-5">
							<span aria-hidden="true">$ </span>typelapse --from-pr 1247
						</p>
					</RevealItem>
					<RevealItem>
						<div className="proto-continuum" style={{ background: theme.background }}>
							<p className="proto-continuum-file">acme/api · api/users.ts · +2 −1</p>
							<EngineFrames
								frames={CONTINUUM_FRAMES}
								holds={CONTINUUM_HOLDS}
								theme={theme}
								fontSize={17}
								lineNumbers
								ariaLabel="A pull request diff becoming the code it produces, line by line"
							/>
						</div>
					</RevealItem>
					<RevealItem>
						<h1 className="lp-display-mono mt-8 max-w-[26ch] text-ink">{HEADLINE}</h1>
					</RevealItem>
					<RevealItem>
						<div className="mt-6 flex flex-wrap items-center gap-3">
							<PrimaryCta />
							<SecondaryCta />
						</div>
					</RevealItem>
					<RevealItem>
						<p className="lp-micro mt-6">{MICRO}</p>
					</RevealItem>
				</RevealGroup>
			</div>
		</section>
	);
}
