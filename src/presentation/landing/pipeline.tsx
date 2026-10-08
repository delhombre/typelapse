import { type ReactNode, useRef } from "react";
import { ExportShapes } from "./export-section";
import { HairlineFigure } from "./figures/hairline-figure";
import type { HairlineFigureDef } from "./figures/types";
import { LiveMorph } from "./magic-move-section";
import { useScrollFades } from "./scroll-fade";
import { FeedCheck } from "./social-section";
import { ThemedShot } from "./themed-shot";
import { CONTAINER } from "./tokens";

/**
 * The page is the pipeline (decision 2026-10-08-landing-pipeline D1): a strip of
 * the five steps under the hero, then the same five as stages on one vertical
 * rail, in the order of use. Each stage pairs a hairline figure, which draws what
 * a screenshot cannot show, with the product itself: the studio's import, its
 * engine running, its feed preview, its export shapes, a real export.
 *
 * The figures are imported only when their stage nears the viewport, so the
 * kernel and the five figures are one late chunk the hero never waits on.
 */

type FigureLoader = () => Promise<{ default: HairlineFigureDef }>;

interface Step {
	id: string;
	n: string;
	name: string;
	/** The strip's few words under the name. */
	gist: string;
}

const STEPS: Step[] = [
	{ id: "paste", n: "01", name: "Paste", gist: "a link, a diff, a snippet" },
	{ id: "morph", n: "02", name: "Morph", gist: "tokens glide" },
	{ id: "check", n: "03", name: "Check", gist: "under the feed" },
	{ id: "export", n: "04", name: "Export", gist: "on your machine" },
	{ id: "hosted", n: "05", name: "Hosted", gist: "captions and sound" },
];

/** The five steps in one row: a table of contents that is also the story's outline. */
export function StepStrip() {
	/* On a phone the row scrolls on its own; its edges fade where it still hides a step. */
	const row = useRef<HTMLOListElement>(null);
	useScrollFades(row);
	return (
		<nav className="lp-steps" aria-label="The five steps">
			<div className={CONTAINER}>
				<ol ref={row}>
					{STEPS.map((step) => (
						<li key={step.id}>
							<a href={`#${step.id}`}>
								<b>
									{step.n} {step.name}
								</b>
								{step.gist}
							</a>
						</li>
					))}
				</ol>
			</div>
		</nav>
	);
}

interface StageProps {
	step: string;
	eyebrow: string;
	title: string;
	children: ReactNode;
	figure: { load: FigureLoader; label: string; hint: string };
	picture: ReactNode;
	/** Picture first on a wide screen, so the figures alternate sides down the rail. */
	flip?: boolean;
}

function Stage({ step, eyebrow, title, children, figure, picture, flip = false }: StageProps) {
	const found = STEPS.find((s) => s.id === step);
	return (
		<article id={step} className="lp-stage-item" aria-labelledby={`${step}-title`}>
			<span className="lp-stop" aria-hidden="true">
				{found?.n}
			</span>
			<header className="lp-stage-head">
				<p className="lp-eyebrow">{eyebrow}</p>
				<h2 id={`${step}-title`} className="lp-h2 text-ink">
					{title}
				</h2>
				<p className="lp-line lp-stage-line">{children}</p>
			</header>
			<div className="lp-pair" data-flip={flip ? "" : undefined}>
				<HairlineFigure load={figure.load} label={figure.label} hint={figure.hint} />
				<div className="lp-pair-picture">{picture}</div>
			</div>
		</article>
	);
}

const loadScenes: FigureLoader = () => import("./figures/scenes");
const loadGlide: FigureLoader = () => import("./figures/glide");
const loadSafezone: FigureLoader = () => import("./figures/safezone");
const loadLocal: FigureLoader = () => import("./figures/local");
const loadQueue: FigureLoader = () => import("./figures/queue");

export function PipelineSection() {
	return (
		<section id="how-it-works" className={CONTAINER} aria-label="How it works">
			<div className="lp-line-rail">
				<div className="lp-rail" aria-hidden="true" />

				<Stage
					step="paste"
					eyebrow="Paste"
					title="A diff, cut at its hunks."
					figure={{
						load: loadScenes,
						label:
							"A pull request lying flat, cut into five slices; the slice under the pointer stands up as a scene.",
						hint: "Move over the slices",
					}}
					picture={
						<figure className="m-0">
							<ThemedShot
								light="/landing/studio-import-light.webp"
								dark="/landing/studio-import-dark.webp"
								width={1600}
								height={878}
								alt="The Typelapse studio right after a diff of orders.ts is pasted: the frame shows the code before the change, and the timeline holds three scenes."
							/>
							<figcaption className="lp-pic-cap">
								The studio right after a paste: a diff of two hunks, three scenes.
							</figcaption>
						</figure>
					}
				>
					Paste a GitHub pull request, a commit, a unified diff or a plain snippet. The code before
					the change opens the timeline and each hunk becomes the next scene; a pull request with
					several commits can become one chapter per commit.{" "}
					<strong>Focus, captions and timing stay editable.</strong>
				</Stage>

				<Stage
					step="morph"
					eyebrow="Morph"
					title="Tokens glide. Nothing crossfades."
					flip
					figure={{
						load: loadGlide,
						label:
							"A code window lying flat; the pointer’s position sets how far its tokens have glided from the first frame to the second.",
						hint: "Move left and right",
					}}
					picture={
						<figure className="m-0">
							<LiveMorph />
							<figcaption className="lp-pic-cap">
								The studio’s engine, running on this page.
							</figcaption>
						</figure>
					}
				>
					Between two scenes, the tokens both share slide to their new places, the ones that leave
					go first and the new ones arrive last. Or type the first scene out, caret and all.{" "}
					<strong>One engine draws the preview and the file</strong>, so what plays in the studio is
					what you post.
				</Stage>

				<Stage
					step="check"
					eyebrow="Check"
					title="Under the feed’s chrome."
					figure={{
						load: loadSafezone,
						label:
							"A phone with a feed’s chrome marked on its glass; drawing the code card under the rail or the caption lights that zone.",
						hint: "Drag the card across the glass",
					}}
					picture={<FeedCheck />}
				>
					Preview the cut inside TikTok, Reels, Shorts, X or LinkedIn, with each feed’s real safe
					zones. If a caption or the action rail would cover your code, you see it before you post.{" "}
					<strong>The chrome stays in the preview</strong>; it never reaches the file.
				</Stage>

				<Stage
					step="export"
					eyebrow="Export"
					title="Written on your machine."
					flip
					figure={{
						load: loadLocal,
						label:
							"A laptop exports a video; frames stack on the desk while the slot above, where a server would take the file, stays empty.",
						hint: "Move along the desk",
					}}
					picture={<ExportShapes />}
				>
					MP4, WebM, GIF or PNG, at 1080p, 1440p or 4K, in 16:9, 1:1, 4:5, 3:4 or 9:16. The encoder
					runs in your browser.{" "}
					<strong>Nothing is uploaded and there is no account to make.</strong>
				</Stage>

				<Stage
					step="hosted"
					eyebrow="Hosted, when you want it"
					title="Or we render it, with captions and sound."
					figure={{
						load: loadQueue,
						label:
							"A render server and its queue; the job under the pointer rises, and the dots on its lid give its size.",
						hint: "Pick a job",
					}}
					picture={
						<figure className="m-0">
							<div className="lp-pic">
								<img
									src="/landing/diff-review.webp"
									width={1120}
									height={630}
									loading="lazy"
									decoding="async"
									alt="A Typelapse export of a diff in review: the N+1 query in orders.ts, its removed lines in red, on a warm mesh."
								/>
							</div>
							<figcaption className="lp-pic-cap">
								A frame of a diff in review. A hosted render of it carries its captions and its
								sound.
							</figcaption>
						</figure>
					}
				>
					A hosted render runs the same engine on our servers and is, today, the one path that bakes
					captions and audio into the file. Your projects can live there too.{" "}
					<strong>This is the paid side</strong>; everything above stays free.
				</Stage>
			</div>
		</section>
	);
}
