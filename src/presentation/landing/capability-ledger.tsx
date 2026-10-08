import { Eyebrow } from "./primitives";
import { CONTAINER, HAIRLINE } from "./tokens";

/** What the tool actually does today: four plain columns, one line each.
    No Export column — the section directly above is the export section, and the
    ledger repeating its chips verbatim made the page stutter. Share carries the
    features the page never states anywhere else. */
const CAPABILITIES: [string, string][] = [
	["Import", "Paste code, a git diff or a GitHub PR URL."],
	["Look", "7 themes, 4 window chromes, mesh, solid and image backdrops."],
	["Motion", "Token morph, typewriter, spotlight and zoom, captions, tempo."],
	["Share", "A link that reopens your project, JSON in and out, PNG stills."],
];

/**
 * A quiet ledger of the feature set: a hairline-topped four-column definition
 * list, each column settling a beat after the last.
 */
export function CapabilityLedger() {
	return (
		<section className={`${CONTAINER} pb-8`}>
			{/* The one section that had no title at all, which left it reading as an
			    orphan of the export block above. An eyebrow alone is enough: it earns
			    its place in the hierarchy without competing with the close below. */}
			<div className={`border-t ${HAIRLINE} pt-14`}>
				<Eyebrow>Spec sheet</Eyebrow>
			</div>
			<dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
				{CAPABILITIES.map(([label, detail]) => (
					<div key={label}>
						{/* The label is the strong one: 13px ink in the face's own case, so it
						    does not repeat the section's eyebrow above it, and the detail
						    is the quieter line under it. */}
						<dt className="font-semibold text-[13px] text-ink leading-5">{label}</dt>
						<dd className="mt-2 text-[15px] text-ash leading-relaxed">{detail}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
