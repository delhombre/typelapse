import { TRANSITION_MS } from "@/application/magic-move/timeline";
import { Theme } from "@/domain/entities/theme";
import { LoopingFrames } from "@/presentation/components/preview/looping-frames";
import { useEffect, useState } from "react";
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
			<div className="lp-morph-frame">
				<LoopingFrames
					frames={STEPS}
					holds={HOLDS}
					theme={Theme.oneDark()}
					fontSize={15}
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
