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

/** A fitted size and the room it was fitted to. */
export interface MorphFit {
	room: number;
	size: number;
}

const FIT_STEP = 0.25;

/**
 * One layout pass of the fit: the size to draw next, or `fit` itself once it
 * has come to rest.
 *
 * The size is estimated once per room, from the code's width at its designed
 * size, then only ever stepped down while the drawn code is still wider than
 * the room. Chromium on Linux snaps `ch` to whole pixels, so the drawn width is
 * not proportional to the font size: estimated again from whatever size had
 * just been drawn, the fit found a new answer every pass and the section's
 * height stepped between three values every frame (#125). A size that only
 * goes down for a given room cannot cycle.
 */
export function refitMorphFont({
	fit,
	room,
	designedWidth,
	drawnWidth,
	max,
}: {
	fit: MorphFit | undefined;
	room: number;
	designedWidth: number;
	drawnWidth: number;
	max: number;
}): MorphFit {
	if (!fit || fit.room !== room) {
		return {
			room,
			size: fitMorphFontSize({
				available: room,
				naturalWidth: designedWidth,
				naturalSize: max,
				max,
			}),
		};
	}
	if (drawnWidth > room && fit.size > FIT_STEP) {
		return { room, size: fit.size - FIT_STEP };
	}
	return fit;
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
	const [room, setRoom] = useState(0);
	/* Unset while the code is drawn at its designed size: that is the only
	   size its width is measured at. */
	const [fit, setFit] = useState<MorphFit>();
	const designedWidth = useRef(0);
	const fontSize = fit?.size ?? MORPH_FONT;

	/* Sized the way the Instrument's window already is on a phone: the whole
	   demo scales to its frame rather than showing part of it. The room is the
	   column the demo sits in, not the frame: the frame hugs its code, so
	   measured on itself a shrunk font shrank the frame, and a phone turned to
	   landscape kept the small size it had no reason to keep. Only its width
	   counts: its height follows the font, and a refit on every height change
	   is what kept the fit from settling (#125). Once the mono has loaded the
	   code is measured again, since `ch` changes with it. */
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
		const measure = () =>
			setRoom(column.clientWidth - horizontalPadding(column) - horizontalPadding(node));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(column);
		document.fonts?.ready.then(() => alive && setFit(undefined));
		return () => {
			alive = false;
			observer.disconnect();
		};
	}, []);

	/* Before paint, so the first frame is already the fitted one. */
	useLayoutEffect(() => {
		const code = frame.current?.firstElementChild as HTMLElement | null;
		if (!code || room <= 0) {
			return;
		}
		if (!fit) {
			designedWidth.current = code.offsetWidth;
		}
		const next = refitMorphFont({
			fit,
			room,
			designedWidth: designedWidth.current,
			drawnWidth: code.offsetWidth,
			max: MORPH_FONT,
		});
		if (next !== fit) {
			setFit(next);
		}
	}, [fit, room]);

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
