/**
 * The caption slot under the frame, and whether the chosen Where draws into it
 * (#271, gate five D4).
 *
 * Only a render that bakes captions (`captionsBakedFor`) puts the text in the
 * frame; the on-device painter keeps the band and leaves it empty, so the
 * preview does too. The band is always the one the layout reserved: the frame
 * never moves when Where changes, only the text in the band fades.
 */
import { motion } from "motion/react";
import { useState } from "react";
import { springs } from "../../motion";
import { StepCaption } from "./step-caption";

interface BakedCaptionProps {
	/** Whether the chosen Where draws the caption in the frame. */
	baked: boolean;
	text: string;
	/** 0..1 fade from `captionAt`. */
	opacity: number;
	scale: number;
	lines: number;
}

export function BakedCaption({ baked, text, opacity, scale, lines }: BakedCaptionProps) {
	// Where leaves the text in the DOM while it fades out, then takes it away: an
	// invisible caption would still be read aloud, and this one now lives in the
	// note under the frame.
	const [drawn, setDrawn] = useState(baked);
	if (baked && !drawn) {
		setDrawn(true);
	}
	return (
		<motion.div
			initial={false}
			animate={{ opacity: baked ? 1 : 0 }}
			transition={springs.snappy}
			onAnimationComplete={() => {
				if (!baked) {
					setDrawn(false);
				}
			}}
		>
			<StepCaption
				text={baked || drawn ? text : ""}
				opacity={opacity}
				scale={scale}
				lines={lines}
			/>
		</motion.div>
	);
}
