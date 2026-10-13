/**
 * The author's line under the frame when the chosen Where does not bake
 * captions (#271, gate five D4): the current step's caption, muted, tagged
 * "Hosted only", with the one way to keep it. It is a sibling of the frame, never
 * inside `[data-export-target]`, so no snapshot or export can carry it, and it
 * hangs out of flow below the frame, so showing or hiding it moves nothing.
 */
import { KeepCaptionsLink } from "../controls/cloud-render";
import { HostedRenderSheet } from "../controls/hosted-render-sheet";

interface CaptionNoteProps {
	text: string;
	/** 0..1 fade from `captionAt`, so the line follows the caption it stands for. */
	opacity: number;
	/** Playing, the line stays mounted through the beat between two captions. */
	playing: boolean;
}

export function CaptionNote({ text, opacity, playing }: CaptionNoteProps) {
	const shown = text !== "";
	return (
		<>
			{shown || playing ? (
				<div
					className="sc-caption-note"
					data-testid="caption-note"
					style={{ opacity }}
					inert={!shown}
					aria-hidden={!shown || undefined}
				>
					<span className="sc-caption-note-tag">Hosted only</span>
					<span className="sc-caption-note-text">{text}</span>
					<KeepCaptionsLink surface="stage" className="si-note-action" />
				</div>
			) : null}
			<HostedRenderSheet surface="stage" />
		</>
	);
}
