import { motion } from "motion/react";
import { CodeFrame, HEADLINE, LEAD, MICRO } from "./content";

const EASE = [0.23, 1, 0.32, 1] as const;

const rise = (delay: number) => ({
	initial: { opacity: 0, y: 10 },
	animate: { opacity: 1, y: 0 },
	transition: { duration: 0.55, delay, ease: EASE },
});

/**
 * Terminal — axis: the mono carries the page.
 * Left-aligned, dense, no centred display type. The headline is set in Ioskeley
 * so the product's material is the first thing you read. Reads as a tool.
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
			<div style={{ width: "100%", maxWidth: 980, marginInline: "auto" }}>
				<motion.p
					{...rise(0)}
					className="proto-mono proto-micro"
					style={{ marginBottom: "1.25rem" }}
				>
					<span className="tok-com">$</span> typelapse --from-pr 1247
				</motion.p>

				<motion.h1
					{...rise(0.06)}
					className="proto-mono"
					style={{
						fontSize: "clamp(1.75rem, 3.6vw, 3rem)",
						lineHeight: 1.15,
						letterSpacing: "-0.02em",
						fontWeight: 600,
						maxWidth: "24ch",
						textWrap: "balance",
					}}
				>
					{HEADLINE}
				</motion.h1>

				<motion.p {...rise(0.12)} className="proto-lead" style={{ marginTop: "1.25rem" }}>
					{LEAD}
				</motion.p>

				<motion.div
					{...rise(0.18)}
					style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem" }}
				>
					<button type="button" className="proto-cta">
						Open the studio
					</button>
					<button type="button" className="proto-cta proto-cta-ghost">
						View source
					</button>
				</motion.div>

				<motion.div {...rise(0.24)} style={{ marginTop: "2.5rem" }}>
					<CodeFrame label="authorize-hosted-render.ts" />
				</motion.div>

				<motion.p {...rise(0.3)} className="proto-micro" style={{ marginTop: "1rem" }}>
					{MICRO}
				</motion.p>
			</div>
		</section>
	);
}

/**
 * Editorial — axis: the sans carries the page, the code is the object.
 * Centred display type, generous air, the frame presented as a specimen.
 */
export function Editorial() {
	return (
		<section
			style={{
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				padding: "6rem 1.5rem",
				textAlign: "center",
			}}
		>
			<div style={{ width: "100%", maxWidth: 1100, marginInline: "auto" }}>
				<motion.h1
					{...rise(0)}
					className="proto-display"
					style={{ marginInline: "auto", maxWidth: "18ch" }}
				>
					{HEADLINE}
				</motion.h1>

				<motion.p
					{...rise(0.08)}
					className="proto-lead"
					style={{ marginInline: "auto", marginTop: "1.5rem", textAlign: "center" }}
				>
					{LEAD}
				</motion.p>

				<motion.div
					{...rise(0.14)}
					style={{
						display: "flex",
						gap: "0.75rem",
						marginTop: "2rem",
						justifyContent: "center",
					}}
				>
					<button type="button" className="proto-cta">
						Open the studio
					</button>
					<button type="button" className="proto-cta proto-cta-ghost">
						View source
					</button>
				</motion.div>

				<motion.div
					{...rise(0.22)}
					style={{ marginTop: "3.5rem", maxWidth: 860, marginInline: "auto", textAlign: "start" }}
				>
					<CodeFrame label="authorize-hosted-render.ts" />
				</motion.div>

				<motion.p {...rise(0.3)} className="proto-micro" style={{ marginTop: "1.25rem" }}>
					{MICRO}
				</motion.p>
			</div>
		</section>
	);
}

/**
 * Split — axis: a different layout model. Argument left, the artefact right,
 * both above the fold at desktop width. Densest of the three, most SaaS-like.
 */
export function Split() {
	return (
		<section
			style={{
				minHeight: "100vh",
				display: "flex",
				alignItems: "center",
				padding: "5rem 1.5rem",
			}}
		>
			<div
				style={{
					width: "100%",
					maxWidth: 1180,
					marginInline: "auto",
					display: "grid",
					gap: "3rem",
					gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
					alignItems: "center",
				}}
			>
				<div>
					<motion.p
						{...rise(0)}
						className="proto-mono proto-micro"
						style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
					>
						Open source
					</motion.p>

					<motion.h1
						{...rise(0.06)}
						style={{
							fontSize: "clamp(2.25rem, 4vw, 3.25rem)",
							lineHeight: 1.08,
							letterSpacing: "-0.03em",
							fontWeight: 600,
							marginTop: "0.75rem",
							maxWidth: "16ch",
							textWrap: "balance",
						}}
					>
						{HEADLINE}
					</motion.h1>

					<motion.p {...rise(0.12)} className="proto-lead" style={{ marginTop: "1.25rem" }}>
						{LEAD}
					</motion.p>

					<motion.div
						{...rise(0.18)}
						style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem" }}
					>
						<button type="button" className="proto-cta">
							Open the studio
						</button>
						<button type="button" className="proto-cta proto-cta-ghost">
							View source
						</button>
					</motion.div>

					<motion.p {...rise(0.24)} className="proto-micro" style={{ marginTop: "1.5rem" }}>
						{MICRO}
					</motion.p>
				</div>

				<motion.div {...rise(0.16)} style={{ minWidth: 0 }}>
					<CodeFrame label="pull/1247 · authorize-hosted-render.ts" />
				</motion.div>
			</div>
		</section>
	);
}
