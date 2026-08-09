import { type Variants, motion, useReducedMotion } from "motion/react";
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

/** What the tool actually does today: four plain columns, one line each. */
const CAPABILITIES: [string, string][] = [
	["Export", "MP4, WebM, GIF, PNG"],
	["Look", "7 themes, 4 window chromes, mesh, solid and image backdrops"],
	["Motion", "token morph, typewriter, spotlight and zoom, captions, tempo"],
	["Import", "paste code, a git diff, or a GitHub PR URL"],
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
			<motion.dl
				initial="hidden"
				whileInView="shown"
				viewport={REVEAL_VIEWPORT}
				variants={parent}
				className={`grid grid-cols-1 gap-x-10 gap-y-10 border-t ${HAIRLINE} pt-14 sm:grid-cols-2 lg:grid-cols-4`}
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
