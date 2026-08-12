import { Theme } from "@/domain/entities/theme";
import { LoopingFrames } from "@/presentation/components/preview/looping-frames";
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
const HOLDS = [1900, 2100, 2600, 1000];

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
	return (
		<div className="lp-morph-frame">
			<LoopingFrames
				frames={STEPS}
				holds={HOLDS}
				theme={Theme.oneDark()}
				fontSize={15}
				lineNumbers
				ariaLabel="A code snippet morphing token by token as two lines are added"
			/>
		</div>
	);
}
