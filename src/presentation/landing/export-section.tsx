import { FrameFan } from "./frame-fan";
import { Chip, Eyebrow, Reveal, RevealGroup, RevealItem } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

const FORMATS = ["MP4", "WebM", "GIF", "PNG"];
const ASPECTS = ["16:9", "1:1", "9:16", "4:5", "3:4"];

/** Feature d: export breadth, shown as format + aspect chips over the theme fan. */
export function ExportSection() {
	return (
		<section className={`${CONTAINER} ${SECTION_PY}`}>
			<Reveal className="mx-auto max-w-2xl text-center">
				<Eyebrow>Export</Eyebrow>
				<h2 className="lp-h2 mt-4 text-ink">MP4, WebM, GIF. Every aspect.</h2>
				<p className="lp-line mx-auto mt-4 max-w-xl">
					Render to any format and any shape, from a wide 16:9 to a vertical 9:16, in seven themes
					over living mesh backdrops.
				</p>
			</Reveal>

			<RevealGroup className="mt-10 flex flex-col items-center gap-3">
				<RevealItem className="flex flex-wrap justify-center gap-2">
					{FORMATS.map((format) => (
						<Chip key={format}>{format}</Chip>
					))}
				</RevealItem>
				<RevealItem className="flex flex-wrap justify-center gap-2">
					{ASPECTS.map((aspect) => (
						<Chip key={aspect}>{aspect}</Chip>
					))}
				</RevealItem>
			</RevealGroup>

			<Reveal className="mt-4">
				<FrameFan />
			</Reveal>
		</section>
	);
}
