import { FrameFan } from "./frame-fan";
import { Eyebrow, Reveal } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

/** Feature d: export breadth. The line names the formats, the fan shows the
    shapes. A chip row of the four formats stood between them and said the
    line's own words again (pass 2026-10-05). */
export function ExportSection() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY}`}>
			<Reveal className="mx-auto max-w-2xl text-center">
				<Eyebrow>Step 04 · Ship</Eyebrow>
				<h2 className="lp-h2 mt-4 text-ink">Then ship it, every shape at once.</h2>
				<p className="lp-line mx-auto mt-4 max-w-xl">
					One clip, five cuts: the same change renders to MP4, WebM, GIF or PNG, in every aspect the
					feeds ask for.
				</p>
			</Reveal>

			{/* No reveal around the fan: the five shapes are the claim, and one
			    wrapper would fade them in as a single 380px block. */}
			<div className="mt-10">
				<FrameFan />
			</div>
		</section>
	);
}
