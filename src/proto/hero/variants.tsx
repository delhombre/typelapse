import { motion } from "motion/react";
import { HEADLINE, LEAD, MICRO, MorphingCode } from "./content";

const EASE = [0.23, 1, 0.32, 1] as const;

const rise = (delay: number) => ({
	initial: { opacity: 0, y: 10 },
	animate: { opacity: 1, y: 0 },
	transition: { duration: 0.55, delay, ease: EASE },
});

/**
 * Terminal, the chosen direction: the mono carries the page, left aligned.
 * Rendered in whichever theme the harness sets, so the only thing being judged
 * here is light against dark.
 */
export function Terminal() {
	return (
		<section
			style={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				padding: "6rem 1.5rem",
			}}
		>
			<div style={{ width: "100%", maxWidth: 1080, marginInline: "auto" }}>
				<motion.p
					{...rise(0)}
					className="proto-mono proto-micro"
					style={{ marginBottom: "1.25rem" }}
				>
					<span aria-hidden="true">$ </span>typelapse --from-pr 1247
				</motion.p>

				<motion.h1
					{...rise(0.06)}
					className="proto-mono proto-display"
					style={{ maxWidth: "20ch" }}
				>
					{HEADLINE}
				</motion.h1>

				<motion.p {...rise(0.12)} className="proto-lead" style={{ marginTop: "1.25rem" }}>
					{LEAD}
				</motion.p>

				<motion.div
					{...rise(0.18)}
					style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem", flexWrap: "wrap" }}
				>
					<button type="button" className="proto-cta">
						Open the studio
					</button>
					<button type="button" className="proto-cta proto-cta-ghost">
						View source
					</button>
				</motion.div>

				<motion.div {...rise(0.24)} style={{ marginTop: "2.5rem" }}>
					<MorphingCode label="authorize-hosted-render.ts" />
				</motion.div>

				<motion.p {...rise(0.3)} className="proto-micro" style={{ marginTop: "1rem" }}>
					{MICRO}
				</motion.p>
			</div>
		</section>
	);
}
