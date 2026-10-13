import { CARD_SLOT } from "@/application/layout/scene-stage";
import "@/presentation/studio/studio-skeleton.css";
import { useStageFrame } from "@/presentation/studio/use-stage-frame";
import { decodeShareLink } from "@/presentation/utils/share-link";
import {
	openingCodeFolded,
	readShellPreferences,
	scenesBeforeBoot,
} from "@/presentation/utils/shell-preferences";
import { DRAFT_STORAGE_KEY } from "@/presentation/utils/studio-storage-keys";
import { type CSSProperties, useState } from "react";

/**
 * Whether the studio will open with the code card open, so the outline draws
 * that layout and the studio lands in it without a step (#270). It reads what
 * the studio is about to read, without importing the studio: a link's scenes or
 * the stored draft's, and the remembered mode. A first visit has none and opens
 * in Edit.
 */
function opensEditing(): boolean {
	let draft: string | null = null;
	try {
		draft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
	} catch {
		// Blocked storage: the studio is amnesiac too, and opens the default project.
	}
	const scenes = scenesBeforeBoot({ shared: decodeShareLink(), draft });
	return !openingCodeFolded(scenes, readShellPreferences().codeFolded);
}

/**
 * The studio's outline, drawn while its chunk is on the way.
 *
 * Until this existed the Suspense fallback was an empty div: a visitor on a
 * slow phone watched a blank page for seconds. This draws the three things the
 * studio is made of, the header's pills, the frame, the instrument and the
 * timeline (the sheet's peek on a phone), at the places and sizes the studio
 * puts them, so what replaces it settles into the same boxes.
 *
 * The frame is the one that has to land exactly: it is the picture, and the
 * eye follows it. Its box is the layout math the shells use
 * (`application/layout/stage-frame.ts`), not a size of its own, so it is where
 * the studio's frame will be at every window.
 *
 * Its stylesheet is imported here, not in the studio's: the studio's own CSS
 * arrives with the chunk this stands in for. No spinner, because a spinner says
 * "wait" and an outline says "this is what is coming".
 */
export function StudioSkeleton() {
	const [editing] = useState(opensEditing);
	const frame = useStageFrame(editing);
	return (
		<output
			className="studio-root sk-root"
			aria-label="Loading the studio"
			data-editing={editing ? "" : undefined}
			style={{ "--sk-card-slot": `${CARD_SLOT}px` } as CSSProperties}
		>
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
			<span className="sk-card" aria-hidden="true" />
			<span
				className="sk-frame"
				aria-hidden="true"
				style={{
					left: frame.left,
					top: frame.top,
					width: frame.width,
					height: frame.height,
				}}
			/>
			<span className="sk-pill sk-dock" aria-hidden="true" />
			<span className="sk-timeline" aria-hidden="true" />
		</output>
	);
}
