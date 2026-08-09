import { Theme } from "@/domain/entities/theme";
import { Instrument } from "@/presentation/landing/instrument";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CARD_THEME, CodeCard } from "./code-card";
import { EngineFrames } from "./engine-frames";

/* Six hero directions. Each has one idea and one move; none of them is a
   rearrangement of the same boxes.

   The material system is in system.css and was sampled rather than invented.
   The motion follows a source's rules: entrances ease-out and under 300ms,
   scale from 0.94 rather than 0, blur used to mask the gap between two states,
   and nothing animated that a visitor would trigger more than a few times.

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const HEADLINE = "Your pull request, as a video";
const LEAD =
	"Paste a snippet, a diff, or a GitHub pull request. Typelapse morphs it token by token and exports a video that matches the preview frame for frame.";
const MICRO = "MIT licensed · runs on your machine · no account";

/* A real change on a real file, not a three-line toy. The frame is 16:9 because
   that is the shape of the output, and a 16:9 frame holding four lines of code
   is three-quarters empty black — which is what made the earlier pass read as a
   placeholder. Ten lines fill it, and give the morph something to actually do. */
const STEP_1 = `import { db } from "@/lib/db"

export async function GET(req: Request) {
  const users = await db.users.all()
  return Response.json(users)
}`;
const STEP_2 = `import { db } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  return Response.json(active)
}`;
const STEP_3 = `import { db } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get("page") ?? 1)
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  const slice = active.slice((page - 1) * 20, page * 20)
  return Response.json({ page, users: slice })
}`;

const FRAMES = [STEP_1, STEP_2, STEP_3];
const HOLDS = [1600, 1800, 2600, 900];

/* Entrances. One curve, one duration, used everywhere, so the page reads as one
   object arriving rather than six components each doing their own thing. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function rise(delay: number, reduce: boolean) {
	return {
		initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" },
		animate: { opacity: 1, y: 0, filter: "blur(0px)" },
		transition: { duration: reduce ? 0.2 : 0.5, ease: EASE_OUT, delay: reduce ? 0 : delay },
	};
}

function Actions({ micro = true }: { micro?: boolean }) {
	return (
		<>
			<div className="proto-actions">
				<Link to="/app" className="proto-cta">
					Open the studio
				</Link>
				<a href={GITHUB_URL} target="_blank" rel="noreferrer" className="proto-cta-quiet">
					View source
				</a>
			</div>
			{micro && <p className="proto-meta mt-5">{MICRO}</p>}
		</>
	);
}

/* ══════════════════ 1. Ledger ══════════════════
   The restrained one, and the control against which the other five have to
   justify themselves. Pierre's grammar taken at its word: a 60px headline at a
   line-height of 1, a 20px lead in true grey, and one enormous unlit artefact
   that runs off the bottom of the screen instead of being squeezed above it.
   Nothing is decorated. The only reason to scroll is that the object is cut. */

export function Ledger() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-ledger">
			<div className="proto-col">
				<motion.p className="proto-meta mb-6" {...rise(0, reduce)}>
					typelapse --from-pr 1247
				</motion.p>
				<motion.h1 className="proto-display max-w-[15ch]" {...rise(0.06, reduce)}>
					{HEADLINE}
				</motion.h1>
				<motion.p className="proto-lead mt-6" {...rise(0.12, reduce)}>
					{LEAD}
				</motion.p>
				<motion.div className="mt-9" {...rise(0.18, reduce)}>
					<Actions />
				</motion.div>
			</div>

			<motion.div className="proto-wide mt-14" {...rise(0.26, reduce)}>
				<CodeCard
					frames={FRAMES}
					holds={HOLDS}
					title="api/users.ts"
					fontSize={24}
					ariaLabel="A code snippet morphing token by token"
				/>
			</motion.div>
		</section>
	);
}

/* ══════════════════ 2. Reveal ══════════════════
   Same materials, one move: the artefact is not faded in, it is *uncovered*.
   A clip-path inset wipes from the top edge down, which is hardware accelerated,
   causes no layout shift because the frame is already there, and reads as the
   video being developed rather than a card appearing. a source's technique, used
   once, on the one element that deserves it. */

export function Reveal() {
	const reduce = useReducedMotion() ?? false;
	const [open, setOpen] = useState(reduce);

	useEffect(() => {
		if (reduce) {
			setOpen(true);
			return;
		}
		const id = window.setTimeout(() => setOpen(true), 420);
		return () => window.clearTimeout(id);
	}, [reduce]);

	return (
		<section className="proto-hero proto-reveal">
			<div className="proto-col">
				<motion.h1 className="proto-display max-w-[14ch]" {...rise(0, reduce)}>
					{HEADLINE}
				</motion.h1>
				<motion.p className="proto-lead mt-6" {...rise(0.08, reduce)}>
					{LEAD}
				</motion.p>
				<motion.div className="mt-9" {...rise(0.14, reduce)}>
					<Actions />
				</motion.div>
			</div>

			<div className="proto-wide mt-16">
				<div className="proto-reveal-clip" data-open={open ? "" : undefined}>
					<CodeCard
						frames={FRAMES}
						holds={HOLDS}
						title="api/users.ts"
						fontSize={24}
						ariaLabel="A code snippet morphing token by token"
					/>
				</div>
			</div>
		</section>
	);
}

/* ══════════════════ 3. Filmstrip ══════════════════
   The name of the product, drawn. Four frames of the same snippet laid out as a
   contact sheet, bleeding off the right edge so the strip reads as continuing;
   one of them is live and the others are its neighbours in time. A visitor
   understands "timelapse, for code" before reading a word, and it is a shape no
   other developer tool on the page is using. */

const STRIP = [
	{ code: STEP_1, label: "00:00" },
	{ code: STEP_2, label: "00:04" },
	{ code: STEP_3, label: "00:09" },
];

export function Filmstrip() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-filmstrip">
			<div className="proto-col">
				<motion.h1 className="proto-display max-w-[16ch]" {...rise(0, reduce)}>
					Every step of the change, in one take
				</motion.h1>
				<motion.p className="proto-lead mt-6" {...rise(0.08, reduce)}>
					{LEAD}
				</motion.p>
			</div>

			<motion.div className="proto-strip mt-14" {...rise(0.16, reduce)}>
				{/* The live one sits second: the eye lands left-of-centre, and the
				    stills on either side give it a before and an after. */}
				{STRIP.map((cell, i) => (
					<figure
						key={cell.label}
						className="proto-strip-cell"
						data-live={i === 1 ? "" : undefined}
					>
						<CodeCard
							frames={i === 1 ? FRAMES : [cell.code]}
							holds={i === 1 ? HOLDS : [4000]}
							loop={i === 1}
							fontSize={11}
							lineNumbers={false}
							ariaLabel={i === 1 ? "The live frame, morphing" : `Frame at ${cell.label}`}
						/>
						<figcaption className="proto-meta mt-3">{cell.label}</figcaption>
					</figure>
				))}
				<div className="proto-strip-tail" aria-hidden="true" />
			</motion.div>

			<div className="proto-col mt-12">
				<Actions />
			</div>
		</section>
	);
}

/* ══════════════════ 4. Monolith ══════════════════
   The page inverts. Instead of a light page holding a dark card, the hero *is*
   the dark surface and the code sits in it with nothing around it at all — no
   chrome, no card, no border. The headline is set in the product's own mono in
   the same near-white as the code, so type and artefact are the same material.
   The most dramatic of the six, and the one that would set the brand. */

export function Monolith() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-monolith">
			<div className="proto-monolith-inner">
				<motion.p className="proto-meta proto-monolith-meta mb-8" {...rise(0, reduce)}>
					typelapse --from-pr 1247
				</motion.p>

				<motion.h1
					className="proto-display-mono proto-monolith-headline max-w-[18ch]"
					{...rise(0.06, reduce)}
				>
					{HEADLINE}
				</motion.h1>

				{/* No card: the code is painted straight onto the surface, which is
				    what makes the page feel like one object rather than a layout. */}
				<motion.div className="proto-monolith-code mt-12" {...rise(0.16, reduce)}>
					<EngineFrames
						frames={FRAMES}
						holds={HOLDS}
						theme={CARD_THEME}
						fontSize={18}
						lineNumbers
						ariaLabel="A code snippet morphing token by token"
					/>
				</motion.div>

				<motion.div className="proto-monolith-actions mt-14" {...rise(0.22, reduce)}>
					<Link to="/app" className="proto-cta proto-cta-invert">
						Open the studio
					</Link>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="proto-cta-quiet proto-cta-quiet-invert"
					>
						View source
					</a>
				</motion.div>
			</div>
		</section>
	);
}

/* ══════════════════ 5. Slider ══════════════════
   The claim is "what you paste becomes what you export", so the hero lets you
   check. One frame, two layers, a handle: drag left for the source you gave it,
   drag right for the video it made. Built on the same clip-path inset as
   Reveal, so the two layers stay in place and only the clip moves.

   Friction as a feature: the visitor does one small piece of work and gets a
   verified claim instead of a promised one. */

export function Slider() {
	const reduce = useReducedMotion() ?? false;
	const [pos, setPos] = useState(58);
	const trackRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);

	const moveTo = useCallback((clientX: number) => {
		const el = trackRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const pct = ((clientX - r.left) / r.width) * 100;
		setPos(Math.min(96, Math.max(4, pct)));
	}, []);

	useEffect(() => {
		const onMove = (e: PointerEvent) => {
			if (draggingRef.current) moveTo(e.clientX);
		};
		const onUp = () => {
			draggingRef.current = false;
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	}, [moveTo]);

	return (
		<section className="proto-hero proto-slider">
			<div className="proto-col">
				<motion.h1 className="proto-display max-w-[15ch]" {...rise(0, reduce)}>
					What you paste. What you get.
				</motion.h1>
				<motion.p className="proto-lead mt-6" {...rise(0.08, reduce)}>
					Drag the handle. On the left is the diff you gave Typelapse; on the right is the frame it
					exports, rendered by the same engine that draws this page.
				</motion.p>
			</div>

			<motion.div className="proto-wide mt-14" {...rise(0.16, reduce)}>
				{/* Pointer drag only, deliberately: the keyboard path is the range input
				    below, which owns the same value and is visible rather than hidden. */}
				<div
					className="proto-slider-track"
					ref={trackRef}
					onPointerDown={(e) => {
						draggingRef.current = true;
						moveTo(e.clientX);
					}}
				>
					<div className="proto-slider-layer proto-slider-source">
						<CodeCard
							frames={[SOURCE_DIFF]}
							holds={[4000]}
							loop={false}
							theme={SOURCE_THEME}
							title="what you pasted — the diff"
							fontSize={17}
							lineNumbers={false}
							ariaLabel="The pasted diff"
						/>
					</div>

					<div
						className="proto-slider-layer proto-slider-result"
						style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
					>
						<CodeCard
							frames={FRAMES}
							holds={HOLDS}
							title="what it exports — the video"
							fontSize={17}
							ariaLabel="The exported frame, morphing"
						/>
					</div>

					<div className="proto-slider-handle" style={{ left: `${pos}%` }} aria-hidden="true">
						<span className="proto-slider-grip" />
					</div>
				</div>

				<label className="proto-slider-input">
					<span className="sr-only">Reveal the exported frame</span>
					<input
						type="range"
						min={4}
						max={96}
						value={Math.round(pos)}
						onChange={(e) => setPos(Number(e.target.value))}
					/>
				</label>
			</motion.div>

			<div className="proto-col mt-10">
				<Actions />
			</div>
		</section>
	);
}

/* The pasted side is set in a light theme: it is paper, not video. */
const SOURCE_THEME = Theme.frost();

const SOURCE_DIFF = `@@ -3,6 +3,10 @@ export async function GET(req: Request) {
   export async function GET(req: Request) {
+    const { searchParams } = new URL(req.url)
+    const page = Number(searchParams.get("page") ?? 1)
     const users = await db.users.all()
-    return Response.json(users)
+    const active = users.filter((u) => u.active)
+    const slice = active.slice((page - 1) * 20, page * 20)
+    return Response.json({ page, users: slice })
   }`;

/* ══════════════════ 6. Instrument ══════════════════
   The current landing's object, kept honestly in the set so the five new
   directions have the incumbent to beat, but re-set on the sampled scale: the
   headline goes up to 60px at a line-height of 1, the lead becomes a real 20px
   grey, and the copy loses the button row, since the dock already holds the
   call to action. Same object, retyped. */

export function InstrumentDirection() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-instrument">
			<div className="proto-col text-center">
				<motion.h1 className="proto-display mx-auto max-w-[16ch]" {...rise(0, reduce)}>
					{HEADLINE}
				</motion.h1>
				<motion.p className="proto-lead mx-auto mt-6 text-center" {...rise(0.08, reduce)}>
					{LEAD}
				</motion.p>
			</div>

			<motion.div className="mt-12" {...rise(0.18, reduce)}>
				<Instrument />
			</motion.div>
		</section>
	);
}
