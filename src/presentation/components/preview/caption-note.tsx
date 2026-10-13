/**
 * The author's line under the frame when the chosen Where does not bake
 * captions (#271, gate five D4): the current step's caption, muted, tagged
 * "Server only" or "Cloud only" (the target that does bake them in this build,
 * named as the Where control names it), with the one way to keep it. It is a
 * sibling of the frame, never inside `[data-export-target]`, so no snapshot or
 * export can carry it, and it hangs out of flow below the frame, so showing or
 * hiding it moves nothing.
 *
 * It fades in and out on the frame caption's own spring (opacity only), so a
 * Where switch is one movement in two places. The playback fade of the caption
 * itself is a style on the row, frame by frame, and does not spring.
 */
import { bakingTargetLabel } from "@/application/export/export-label";
import { serverRenderOffered } from "@/presentation/stores/export.store";
import { motion } from "motion/react";
import { springs } from "../../motion";
import { KeepCaptionsLink } from "../controls/cloud-render";
import { HostedRenderSheet } from "../controls/hosted-render-sheet";

interface CaptionNoteProps {
	text: string;
	/** 0..1 fade from `captionAt`, so the line follows the caption it stands for. */
	opacity: number;
	/** Playing, the line stays up through the beat between two captions. */
	playing: boolean;
}

export function CaptionNote({ text, opacity, playing }: CaptionNoteProps) {
	const shown = text !== "";
	return (
		<>
			<motion.div
				className="sc-caption-note"
				data-testid="caption-note"
				initial={{ opacity: 0 }}
				animate={{ opacity: shown || playing ? 1 : 0 }}
				exit={{ opacity: 0 }}
				transition={springs.snappy}
				inert={!shown}
				aria-hidden={!shown || undefined}
			>
				<div className="sc-caption-note-row" style={{ opacity }}>
					<span className="sc-caption-note-tag">
						{bakingTargetLabel(serverRenderOffered())} only
					</span>
					<span className="sc-caption-note-text">{text}</span>
					<KeepCaptionsLink surface="stage" className="si-note-action" />
				</div>
			</motion.div>
			<HostedRenderSheet surface="stage" />
		</>
	);
}
