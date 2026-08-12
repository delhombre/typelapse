import { FrameFan } from "./frame-fan";
import { Chip, Eyebrow, Reveal, RevealGroup, RevealItem } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

const FORMATS = ["MP4", "WebM", "GIF", "PNG"];

/** Feature d: export breadth, shown as format + aspect chips over the theme fan. */
export function ExportSection() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY}`}>
			<Reveal className="mx-auto max-w-2xl text-center">
				<Eyebrow>Step 04 · Ship</Eyebrow>
				<h2 className="lp-h2 mt-4 text-ink">Then ship it, every shape at once.</h2>
				<p className="lp-line mx-auto mt-4 max-w-xl">
					One clip, five cuts. The same change renders to MP4, WebM, GIF or PNG, in every aspect the
					feeds ask for, across seven themes over living mesh backdrops.
				</p>
			</Reveal>

			{/* Formats stay as chips — a file format has no visual form. The aspect
			    chips are gone: the fan below now *is* the aspect list, each card cut
			    to a real ratio and marked like a proof sheet. */}
			<RevealGroup className="mt-10 flex flex-col items-center gap-3">
				<RevealItem className="flex flex-wrap justify-center gap-2">
					{FORMATS.map((format) => (
						<Chip key={format}>{format}</Chip>
					))}
				</RevealItem>
			</RevealGroup>

			{/* No reveal around the fan: it reveals itself, card by card. One wrapper
			    here would fade all five in as a single 380px block, which is the
			    opposite of the point — the shapes are the claim. */}
			<div className="mt-4">
				<FrameFan />
			</div>
		</section>
	);
}
