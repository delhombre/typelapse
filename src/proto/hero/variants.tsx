import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import { Instrument } from "@/presentation/landing/instrument";
import { GITHUB_URL } from "@/presentation/landing/tokens";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* Six hero directions on one material.
   The flat near-black pass lost: the object Bruno wants is the Instrument, mesh
   backdrop and dock included. So the material is fixed and only the *idea*
   varies — where the object sits, how much of it you get, what it does to the
   page around it. Five new compositions plus the incumbent, unchanged, as the
   thing they have to beat.

   Type and spacing still come from the sampled system in system.css. Motion
   still follows a source: ease-out entrances, nothing over 300ms that a
   visitor triggers repeatedly, blur to bridge two states.

   Throwaway. Delete src/proto and the route in main.tsx once one wins. */

const HEADLINE = "Your pull request, as a video";
const LEAD =
	"Paste a snippet, a diff, or a GitHub pull request. Typelapse morphs it token by token and exports a video that matches the preview frame for frame.";
const MICRO = "MIT licensed · runs on your machine · no account";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function rise(delay: number, reduce: boolean) {
	return {
		initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" },
		animate: { opacity: 1, y: 0, filter: "blur(0px)" },
		transition: { duration: reduce ? 0.2 : 0.5, ease: EASE_OUT, delay: reduce ? 0 : delay },
	};
}

function Actions({ invert = false }: { invert?: boolean }) {
	return (
		<div className="proto-actions">
			<Link to="/app" className={invert ? "proto-cta proto-cta-invert" : "proto-cta"}>
				Open the studio
			</Link>
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noreferrer"
				className={invert ? "proto-cta-quiet proto-cta-quiet-invert" : "proto-cta-quiet"}
			>
				View source
			</a>
		</div>
	);
}

/**
 * A drifting mesh, painted on any element.
 *
 * The Instrument owns one of these inside its own frame; these compositions need
 * a second one on the page itself, which is why it is pulled out here. Pure
 * time-driven CSS, same generator as the export, so the page and the video are
 * literally the same gradient.
 */
function useMeshBackdrop(presetId: string, playing = true) {
	const ref = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion();

	useEffect(() => {
		const preset = MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0];
		const el = ref.current;
		if (!el || !preset) {
			return;
		}
		if (reduce || !playing) {
			el.style.background = meshGradientCss(preset, 3);
			return;
		}
		let raf = 0;
		let cancelled = false;
		const tick = (now: number) => {
			if (cancelled) {
				return;
			}
			el.style.background = meshGradientCss(preset, now / 1000);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [presetId, playing, reduce]);

	return ref;
}

/* ══════════════════ 1. Bleed ══════════════════
   The product shot stops being a card. The frame runs the full width of the
   window with no radius and no edge, so the mesh is the top of the page rather
   than something sitting on it, and the code window floats in open colour. The
   dock hangs below it on the paper.

   This is the direction that treats the instrument as the page's own material
   instead of its illustration. */

export function Bleed() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-bleed">
			<motion.div className="proto-bleed-stage" {...rise(0, reduce)}>
				<Instrument maxScale={2.6} />
			</motion.div>

			<div className="proto-col proto-bleed-copy">
				<motion.h1 className="proto-display max-w-[15ch]" {...rise(0.14, reduce)}>
					{HEADLINE}
				</motion.h1>
				<motion.p className="proto-lead mt-5" {...rise(0.2, reduce)}>
					{LEAD}
				</motion.p>
				<motion.p className="proto-meta mt-7" {...rise(0.26, reduce)}>
					{MICRO}
				</motion.p>
			</div>
		</section>
	);
}

/* ══════════════════ 2. Recto ══════════════════
   Argument left, object right, and the object is deliberately too big for the
   page: it is cropped by the right edge rather than politely contained. A
   product shot that fits inside the margin reads as a screenshot; one that runs
   out of the window reads as a thing you are looking at part of.

   The crop is the whole idea, so nothing else in the composition competes. */

export function Recto() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-recto">
			<div className="proto-recto-grid">
				<div className="proto-recto-copy">
					<motion.p className="proto-meta mb-6" {...rise(0, reduce)}>
						typelapse --from-pr 1247
					</motion.p>
					<motion.h1 className="proto-display max-w-[13ch]" {...rise(0.06, reduce)}>
						{HEADLINE}
					</motion.h1>
					<motion.p className="proto-lead mt-6 max-w-[38ch]" {...rise(0.12, reduce)}>
						{LEAD}
					</motion.p>
					<motion.div className="mt-8" {...rise(0.18, reduce)}>
						<Actions />
					</motion.div>
					<motion.p className="proto-meta mt-6" {...rise(0.24, reduce)}>
						{MICRO}
					</motion.p>
				</div>

				<motion.div className="proto-recto-object" {...rise(0.3, reduce)}>
					<Instrument maxScale={1.45} />
				</motion.div>
			</div>
		</section>
	);
}

/* ══════════════════ 3. Poster ══════════════════
   The frame is hung, not embedded. It sits centred with air on every side and
   the headline goes *underneath* it, set small, the way a gallery labels a
   print rather than the way a landing page shouts over one.

   Inverts the usual hierarchy: the object speaks first and the words explain
   afterwards. Only works if the object is worth the wall, which is the bet. */

export function Poster() {
	const reduce = useReducedMotion() ?? false;

	return (
		<section className="proto-hero proto-poster">
			<motion.div className="proto-poster-frame" {...rise(0, reduce)}>
				<Instrument maxScale={1.15} />
			</motion.div>

			<div className="proto-poster-caption">
				<motion.h1 className="proto-poster-title" {...rise(0.18, reduce)}>
					{HEADLINE}
				</motion.h1>
				<motion.p className="proto-lead proto-poster-lead mt-4" {...rise(0.24, reduce)}>
					{LEAD}
				</motion.p>
				<motion.div className="proto-poster-actions mt-7" {...rise(0.3, reduce)}>
					<Actions />
				</motion.div>
			</div>
		</section>
	);
}

/* ══════════════════ 4. Stack ══════════════════
   One pull request is not one video: it is a chapter per commit, a cut per
   ratio, a version per theme. So the hero is a short stack of frames offset
   behind the live one, like prints left on a desk.

   It sells the thing the single-frame heroes cannot: that the output is a set,
   and that the tool made all of it from one paste. */

const STACK_BACKS = ["forest", "ember"];

export function Stack() {
	const reduce = useReducedMotion() ?? false;
	const back1 = useMeshBackdrop(STACK_BACKS[0] ?? "aurora", false);
	const back2 = useMeshBackdrop(STACK_BACKS[1] ?? "aurora", false);

	return (
		<section className="proto-hero proto-stack">
			<div className="proto-col">
				<motion.h1 className="proto-display max-w-[15ch]" {...rise(0, reduce)}>
					One paste. Every cut you need.
				</motion.h1>
				<motion.p className="proto-lead mt-6" {...rise(0.08, reduce)}>
					A chapter per commit, a frame per ratio, a version per theme. Typelapse renders the whole
					set from one pull request, and the preview you tune is the file you ship.
				</motion.p>
			</div>

			<motion.div className="proto-stack-deck mt-14" {...rise(0.18, reduce)}>
				{/* The two behind are still frames, not live instruments: three engines
				    and three rAF loops for one composition is a cost the page would pay
				    on every visit, for something a visitor reads as one object. */}
				<div className="proto-stack-back proto-stack-back-2" ref={back2} aria-hidden="true" />
				<div className="proto-stack-back proto-stack-back-1" ref={back1} aria-hidden="true" />
				<div className="proto-stack-live">
					<Instrument maxScale={1.05} />
				</div>
			</motion.div>

			<div className="proto-col mt-12">
				<Actions />
				<p className="proto-meta mt-5">{MICRO}</p>
			</div>
		</section>
	);
}

/* ══════════════════ 5. Canvas ══════════════════
   The dock does not restyle a card, it restyles the page. Pick a backdrop and
   the whole hero takes that colour; the frame stops being an object on a page
   and becomes a window cut into it.

   The most opinionated of the five, and the only one where the controls change
   something a visitor cannot miss. It is also the honest reading of what the
   product is: a thing that makes the look, not a thing that shows one. */

export function Canvas() {
	const reduce = useReducedMotion() ?? false;
	const [presetId, setPresetId] = useState("aurora");
	const wash = useMeshBackdrop(presetId);

	return (
		<section className="proto-hero proto-canvas">
			{/* The page's own wash: the same generator as the frame's, run at a much
			    lower opacity so the code inside stays the brightest thing on screen. */}
			<div className="proto-canvas-wash" ref={wash} aria-hidden="true" />

			<div className="proto-canvas-inner">
				<div className="proto-col">
					<motion.h1
						className="proto-display mx-auto max-w-[15ch] text-center"
						{...rise(0, reduce)}
					>
						{HEADLINE}
					</motion.h1>
					<motion.p className="proto-lead mx-auto mt-6 text-center" {...rise(0.08, reduce)}>
						{LEAD}
					</motion.p>
				</div>

				<motion.div className="mt-12" {...rise(0.18, reduce)}>
					<Instrument onPresetChange={setPresetId} />
				</motion.div>

				<motion.p className="proto-meta proto-canvas-micro mt-8" {...rise(0.26, reduce)}>
					{MICRO}
				</motion.p>
			</div>
		</section>
	);
}

/* ══════════════════ 6. Instrument ══════════════════
   The incumbent, kept exactly as it ships apart from the headline being re-set
   on the sampled scale. Every direction above has to be better than this to be
   worth the change. */

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

			<motion.p className="proto-meta proto-instrument-micro mt-8" {...rise(0.26, reduce)}>
				{MICRO}
			</motion.p>
		</section>
	);
}
