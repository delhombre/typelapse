import { timelineMotion } from "@/presentation/components/timeline/timeline-motion";
import { springs } from "@/presentation/motion";
import { motion, useReducedMotion } from "motion/react";
import { Trash, Undo } from "reicon-react";

export function SceneDeletionUndo({
	sceneNumber,
	onUndo,
	compact = false,
	minimal = false,
}: {
	sceneNumber: number;
	onUndo: () => void;
	compact?: boolean;
	minimal?: boolean;
}) {
	const reduce = useReducedMotion() === true;
	const motionConfig = timelineMotion(reduce, true).context;

	return (
		<motion.section
			// Not live itself: it mounts with its words, which a screen reader would
			// not read. Where it is used, a LiveRegion mounted ahead of it speaks.
			aria-label={`Deleted scene ${sceneNumber}`}
			className={
				compact
					? "scene-list-undo"
					: `studio-scene-undo${minimal ? " studio-scene-undo-minimal" : ""}`
			}
			initial={motionConfig.initial}
			animate={motionConfig.animate}
			exit={motionConfig.exit}
		>
			<span className={minimal ? "sr-only" : "scene-deletion-mark"} aria-hidden="true">
				<Trash size={13} strokeWidth={1.65} />
			</span>
			<span className={minimal ? "sr-only" : "scene-deletion-copy"}>
				Scene {sceneNumber} deleted
			</span>
			<motion.button
				type="button"
				onClick={onUndo}
				aria-label={`Undo delete scene ${sceneNumber}`}
				whileTap={reduce ? undefined : { scale: 0.97 }}
				transition={reduce ? { duration: 0 } : springs.snappy}
			>
				<Undo size={13} strokeWidth={1.7} aria-hidden="true" />
				Undo
			</motion.button>
		</motion.section>
	);
}

/** What the LiveRegion beside each undo says once a scene is gone. */
export function sceneDeletedMessage(sceneNumber: number | undefined): string {
	return sceneNumber === undefined ? "" : `Scene ${sceneNumber} deleted.`;
}
