import { TRANSITION_MS } from "@/application/magic-move/timeline";
import { Theme } from "@/domain/entities/theme";
import { LoopingFrames } from "@/presentation/components/preview/looping-frames";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FeatureSection } from "./feature-section";

/* The signature feature, performed rather than described.
   This section used to be two static frames with an arrow between them, which
   is the weakest way to sell a morph: the page was explaining that code would
   glide, on a page where the engine that glides it was already running. These
   are the same three states the hero cycles, played by the same engine, in a
   frame with no chrome so the movement is the only thing to look at. */
const STEPS = [
	`export async function GET(req: Request) {
  const users = await db.users.all()
  return Response.json(users)
}`,
	`export async function GET(req: Request) {
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  return Response.json(active)
}`,
	`export async function GET(req: Request) {
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  const page = active.slice(0, 20)
  return Response.json(page)
}`,
];
/* Slower than the hero's: this one is read, not glanced at. */
const HOLDS = [900, 1050, 1800];
const PLAYBACK_MS =
	HOLDS.reduce((total, hold) => total + hold, 0) + (STEPS.length - 1) * TRANSITION_MS;

/** The size the code is designed at, and the most it is ever drawn at. */
const MORPH_FONT = 15;

/**
 * The font size at which the code fills the frame's content box and no more.
 *
 * The frame used to hold 15px and scroll the rest: at 375px that cut 188px off
 * the right, which is where the lines that morph in end, and the scroller
 * became a tab stop with nothing to do in it. The code's width is stated in
 * `ch`, so it is proportional to its font size, and one measurement at any size
 * gives the width per pixel of font. Quarter pixels, rounded down: a size rounded
 * up is a size that overflows by a sliver.
 */
export function fitMorphFontSize({
	available,
	naturalWidth,
	naturalSize,
	max,
}: {
	available: number;
	naturalWidth: number;
	naturalSize: number;
	max: number;
}): number {
	if (available <= 0 || naturalWidth <= 0 || naturalSize <= 0) {
		return max;
	}
	const widthPerPx = naturalWidth / naturalSize;
	return Math.min(max, Math.floor((available / widthPerPx) * 4) / 4);
}

/** Feature a: the signature magic-move, shown running. */
export function MagicMoveSection() {
	return (
		<FeatureSection
			eyebrow="Step 02 · Morph"
			title="Then it moves."
			line="The same steps, morphed token by token on a monospace grid. One engine draws the browser preview and the exported video, so what you see here is what you ship."
			align="left"
			visual={<LiveMorph />}
		/>
	);
}

function LiveMorph() {
	const [playing, setPlaying] = useState(false);
	const frame = useRef<HTMLDivElement>(null);
	const [fontSize, setFontSize] = useState(MORPH_FONT);

	/* Sized the way the Instrument's window already is on a phone: the whole
	   demo scales to its frame rather than showing part of it. Measured before
	   paint so the first frame is already the fitted one, again whenever the
	   room changes, and once the mono has loaded, since `ch` changes with it.
	   The room is the column the demo sits in, not the frame: the frame hugs
	   its code, so measured on itself a shrunk font shrank the frame, and a
	   phone turned to landscape kept the small size it had no reason to keep. */
	useLayoutEffect(() => {
		const node = frame.current;
		const column = node?.parentElement?.parentElement;
		if (!node || !column) {
			return;
		}
		let alive = true;
		const horizontalPadding = (el: Element) => {
			const style = getComputedStyle(el);
			return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
		};
		const fit = () => {
			const code = node.firstElementChild as HTMLElement | null;
			if (!alive || !code) {
				return;
			}
			setFontSize(
				fitMorphFontSize({
					available: column.clientWidth - horizontalPadding(column) - horizontalPadding(node),
					naturalWidth: code.offsetWidth,
					naturalSize: Number.parseFloat(getComputedStyle(code).fontSize),
					max: MORPH_FONT,
				}),
			);
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(column);
		document.fonts?.ready.then(fit);
		return () => {
			alive = false;
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		if (!playing) {
			return;
		}
		const timeout = window.setTimeout(() => setPlaying(false), PLAYBACK_MS - 24);
		return () => window.clearTimeout(timeout);
	}, [playing]);

	const replay = () => {
		setPlaying(false);
		window.requestAnimationFrame(() => setPlaying(true));
	};

	return (
		<div className="lp-morph-demo">
			<div ref={frame} className="lp-morph-frame">
				<LoopingFrames
					frames={STEPS}
					holds={HOLDS}
					theme={Theme.oneDark()}
					fontSize={fontSize}
					lineNumbers
					loop={false}
					playing={playing}
					ariaLabel="A code snippet morphing token by token as two lines are added"
				/>
			</div>
			<button type="button" className="lp-demo-replay" onClick={replay}>
				<ReplayIcon />
				<span>{playing ? "Replay" : "Play motion"}</span>
			</button>
		</div>
	);
}

function ReplayIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M13.2 5.4A5.5 5.5 0 1 1 8 2.5c1.45 0 2.76.56 3.74 1.48M13.2 2.4v3.2H10"
				stroke="currentColor"
				strokeWidth="1.45"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
