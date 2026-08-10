import { type Variants, motion, useReducedMotion } from "motion/react";
import { Eyebrow } from "./primitives";
import {
	CONTAINER,
	HAIRLINE,
	LP_EASE,
	REVEAL_DURATION,
	REVEAL_DURATION_REDUCED,
	REVEAL_RISE,
	REVEAL_STAGGER,
	REVEAL_VIEWPORT,
} from "./tokens";

/** What the tool actually does today: four plain columns, one line each.
    No Export column — the section directly above is the export section, and the
    ledger repeating its chips verbatim made the page stutter. Share carries the
    features the page never states anywhere else. */
const CAPABILITIES: [string, string][] = [
	["Import", "paste code, a git diff, or a GitHub PR URL"],
	["Look", "7 themes, 4 window chromes, mesh, solid and image backdrops"],
	["Motion", "token morph, typewriter, spotlight and zoom, captions, tempo"],
	["Share", "a link that reopens your project, JSON in and out, PNG stills"],
];

/**
 * A quiet ledger of the feature set: a hairline-topped four-column definition
 * list, each column settling a beat after the last.
 */
export function CapabilityLedger() {
	const reduce = useReducedMotion();
	const parent: Variants = {
		hidden: {},
		shown: { transition: { staggerChildren: REVEAL_STAGGER } },
	};
	const item: Variants = reduce
		? {
				hidden: { opacity: 0 },
				shown: { opacity: 1, transition: { duration: REVEAL_DURATION_REDUCED, ease: LP_EASE } },
			}
		: {
				hidden: { opacity: 0, y: REVEAL_RISE },
				shown: { opacity: 1, y: 0, transition: { duration: REVEAL_DURATION, ease: LP_EASE } },
			};

	return (
		<section className={`${CONTAINER} pb-8`}>
			{/* The one section that had no title at all, which left it reading as an
			    orphan of the export block above. An eyebrow alone is enough: it earns
			    its place in the hierarchy without competing with the close below. */}
			<div className={`border-t ${HAIRLINE} pt-14`}>
				<Eyebrow>Spec sheet</Eyebrow>
			</div>
			<motion.dl
				initial="hidden"
				whileInView="shown"
				viewport={REVEAL_VIEWPORT}
				variants={parent}
				className="mt-8 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
			>
				{CAPABILITIES.map(([label, detail]) => (
					<motion.div key={label} variants={item}>
						<dt className="lp-eyebrow text-ash">{label}</dt>
						<dd className="mt-3 text-[15px] text-ink leading-relaxed">{detail}</dd>
					</motion.div>
				))}
			</motion.dl>
		</section>
	);
}
