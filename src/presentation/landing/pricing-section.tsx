import { Eyebrow } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

/**
 * Pricing as the line between the two sides of the product, with no prices
 * yet (owner item #79): the user's machine is free, our servers are paid. No
 * button in either column: the close below is this zone's one filled action.
 */
const SIDES = [
	{
		title: "On your machine",
		line: "Free, under AGPL-3.0.",
		points: [
			"Every import, every look, every motion",
			"MP4, WebM, GIF and PNG, up to\u00a04K",
			"No account, nothing uploaded",
		],
	},
	{
		title: "Hosted",
		line: "Paid, when you want our servers.",
		points: [
			"Renders that bake captions and\u00a0audio",
			"Projects kept in your account",
			"Works in a browser with no encoder",
		],
	},
] as const;

export function PricingSection() {
	return (
		<section
			id="pricing"
			className={`${CONTAINER} ${SECTION_PY}`}
			aria-labelledby="pricing-heading"
		>
			<Eyebrow>Pricing</Eyebrow>
			<h2 id="pricing-heading" className="lp-h2 mt-4 text-ink">
				Your machine is free. Ours is paid.
			</h2>
			<div className="lp-cost-grid">
				{SIDES.map((side) => (
					<div key={side.title}>
						<h3 className="lp-h3">{side.title}</h3>
						<p className="lp-line">{side.line}</p>
						<ul>
							{side.points.map((point) => (
								<li key={point}>{point}</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}
