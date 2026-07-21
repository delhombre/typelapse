import type { ReactNode } from "react";
import { Eyebrow, Reveal } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

type Align = "left" | "right" | "center";

interface FeatureSectionProps {
	eyebrow: string;
	title: string;
	line: string;
	visual: ReactNode;
	/** `left` = copy left / visual right, `right` = the reverse, `center` = stacked. */
	align?: Align;
}

/**
 * A clean, spacious feature block: a mono eyebrow, a heading, one line, and a
 * product visual. `left` / `right` lay copy and visual in an alternating two
 * column grid on desktop; `center` stacks them. Copy and visual reveal on scroll,
 * the visual a beat behind.
 */
export function FeatureSection({
	eyebrow,
	title,
	line,
	visual,
	align = "left",
}: FeatureSectionProps) {
	if (align === "center") {
		return (
			<section className={`${CONTAINER} ${SECTION_PY}`}>
				<Reveal className="mx-auto max-w-2xl text-center">
					<Eyebrow>{eyebrow}</Eyebrow>
					<h2 className="lp-h2 mt-4 text-ink">{title}</h2>
					<p className="lp-line mx-auto mt-4 max-w-xl">{line}</p>
				</Reveal>
				<Reveal delay={0.08} className="mt-14 flex justify-center">
					{visual}
				</Reveal>
			</section>
		);
	}

	const visualFirst = align === "right";
	return (
		<section className={`${CONTAINER} ${SECTION_PY}`}>
			<div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
				<Reveal className={visualFirst ? "lg:order-2" : undefined}>
					<Eyebrow>{eyebrow}</Eyebrow>
					<h2 className="lp-h2 mt-4 text-ink">{title}</h2>
					<p className="lp-line mt-4 max-w-md">{line}</p>
				</Reveal>
				<Reveal delay={0.08} className={`flex justify-center ${visualFirst ? "lg:order-1" : ""}`}>
					{visual}
				</Reveal>
			</div>
		</section>
	);
}
