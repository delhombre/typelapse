import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { studioHistory, useStudioHistoryStore } from "@/presentation/stores/project-history.store";
import { motion } from "motion/react";
import { Redo, Undo } from "reicon-react";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The project's undo and redo, the only ones in the studio: code, timing,
 * order, settings, layers and audio all step back through the same history,
 * so there is one place to look for it, next to the project it belongs to.
 */
export function StudioHistoryControls() {
	const canUndo = useStudioHistoryStore((state) => state.canUndo);
	const canRedo = useStudioHistoryStore((state) => state.canRedo);
	const step = (move: () => boolean) => {
		if (move()) {
			feedback("selection");
		}
	};

	return (
		<div className="sc-chip sc-history">
			<StudioTooltip content={IS_MAC ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"} side="bottom">
				<motion.button
					type="button"
					className="hit-ext sc-glyph-button"
					whileTap={canUndo ? { scale: 0.96 } : undefined}
					transition={springs.snappy}
					disabled={!canUndo}
					aria-label="Undo"
					onClick={() => step(studioHistory.undo)}
				>
					<Undo size={15} aria-hidden="true" />
				</motion.button>
			</StudioTooltip>
			<StudioTooltip content={IS_MAC ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Y)"} side="bottom">
				<motion.button
					type="button"
					className="hit-ext sc-glyph-button"
					whileTap={canRedo ? { scale: 0.96 } : undefined}
					transition={springs.snappy}
					disabled={!canRedo}
					aria-label="Redo"
					onClick={() => step(studioHistory.redo)}
				>
					<Redo size={15} aria-hidden="true" />
				</motion.button>
			</StudioTooltip>
		</div>
	);
}
