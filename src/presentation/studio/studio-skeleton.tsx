import "@/presentation/studio/studio-skeleton.css";

/**
 * The studio's outline, drawn while its chunk is on the way.
 *
 * Until this existed the Suspense fallback was an empty div: a visitor on a
 * slow phone watched a blank page for seconds. This draws the three things the
 * studio is made of, the header's pills, the frame, the instrument and the
 * timeline (the sheet's peek on a phone), at the places and sizes the studio
 * puts them, so what replaces it settles into the same boxes.
 *
 * Its stylesheet is imported here, not in the studio's: the studio's own CSS
 * arrives with the chunk this stands in for. No spinner, because a spinner says
 * "wait" and an outline says "this is what is coming".
 */
export function StudioSkeleton() {
	return (
		<output className="studio-root sk-root" aria-label="Loading the studio">
			<div className="sk-header" aria-hidden="true">
				<div className="sk-group-start">
					<span className="sk-pill sk-project" />
					<span className="sk-pill sk-history" />
					<span className="sk-pill sk-resources" />
					<span className="sk-pill sk-more" />
				</div>
				<span className="sk-pill sk-mode" />
				<div className="sk-group-end">
					<span className="sk-pill sk-gallery" />
					<span className="sk-pill sk-utilities" />
				</div>
			</div>
			<div className="sk-stage" aria-hidden="true">
				<span className="sk-frame" />
			</div>
			<span className="sk-pill sk-dock" aria-hidden="true" />
			<span className="sk-timeline" aria-hidden="true" />
		</output>
	);
}
