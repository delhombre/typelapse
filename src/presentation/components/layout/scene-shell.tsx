import { CARD_SLOT, dockTransform, stageTransform } from "@/application/layout/scene-stage";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { trigger } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import {
	readShellPreferences,
	writeShellPreferences,
} from "@/presentation/utils/shell-preferences";
import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useCallback, useState } from "react";
import { ProjectChip } from "./project-chip";
import { SceneCodeCard } from "./scene-code-card";
import { StudioUtilities } from "./studio-utilities";

interface SceneShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/** The arrival, in the order the eye should read it: object, instrument, work. */
const ARRIVAL_DELAY = { stage: 0, dock: 0.07, chrome: 0.11, card: 0.15 } as const;

/**
 * The studio as a scene.
 *
 * There are no columns and no bars. The paper is the page, edge to edge; the
 * preview frame is the object on it; and everything that drives that object
 * floats over the paper rather than framing it — the project in one corner, the
 * file actions in the other, the work surface on the left, the instrument at
 * the bottom.
 *
 * Two things move, and both are transforms. Folding the card slides the stage
 * and the island onto the page's own centre line together, because they share
 * that line and the fold has to read as one object moving rather than two.
 * Raising a cluster sheet steps the stage back instead of covering it. The
 * geometry of both lives in `application/layout/scene-stage.ts`, so what the
 * shell does here is hand it to the springs.
 *
 * The arrival plays once, on the way in. Everything after it is a state change,
 * and a state change that replays the entrance is a page that seems to reload
 * every time you press something.
 */
export function SceneShell({ editor, stepBuilder, preview }: SceneShellProps) {
	const reduce = useReducedMotion() === true;
	const [folded, setFolded] = useState(() => readShellPreferences().codeFolded);
	const [sheetRaised, setSheetRaised] = useState(false);

	const fold = useCallback((next: boolean) => {
		trigger("light");
		setFolded(next);
		writeShellPreferences({ codeFolded: next });
	}, []);

	const stageTo = stageTransform({ folded, sheetRaised }, reduce);
	const stage = { x: stageTo.x, y: stageTo.y, scale: stageTo.scale };
	const dock = { x: dockTransform({ folded, sheetRaised }).x };
	const settle = reduce ? { duration: 0 } : springs.default;

	/** The entrance for one part of the scene, with the beat it arrives on. */
	const arrival = (delay: number, from: { x?: number; y?: number; scale?: number }) => {
		if (reduce) {
			return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } };
		}
		return {
			initial: { opacity: 0, x: 0, y: 0, scale: 1, ...from },
			animate: { opacity: 1, x: 0, y: 0, scale: 1 },
			transition: { ...springs.gentle, delay },
		};
	};

	return (
		// The slot the stage reserves is published from the one place that number
		// lives, so the padding the box takes and the offset the fold travels can
		// never be two different measurements.
		<div
			className="studio-root sc-root"
			style={{ "--sc-card-width": `${CARD_SLOT}px` } as CSSProperties}
		>
			{/* The stage. Its box never resizes — it reserves the card's slot whether
			    the card is there or not — so the fit-to-viewport measurement inside it
			    is computed once and the fold is free to be pure compositing. */}
			{/* Once motion has been declined the stage no longer steps back, so the
			    room the sheet needs has to come from somewhere that is not a
			    transform: the slot simply gives it, in one go. A reflow is not
			    movement, and a caption hidden under a panel is not stillness. */}
			<div className="sc-stage-slot" data-raised={reduce && sheetRaised ? "" : undefined}>
				<motion.div
					className="sc-stage-arrival"
					{...arrival(ARRIVAL_DELAY.stage, { scale: 0.985 })}
				>
					<motion.div className="sc-stage" animate={stage} transition={settle}>
						{preview}
					</motion.div>
				</motion.div>
			</div>

			<motion.div
				className="sc-corner sc-corner-left"
				{...arrival(ARRIVAL_DELAY.chrome, { y: -8 })}
			>
				<ProjectChip />
			</motion.div>

			<motion.div
				className="sc-corner sc-corner-right"
				{...arrival(ARRIVAL_DELAY.chrome, { y: -8 })}
			>
				<StudioUtilities />
			</motion.div>

			<motion.div className="sc-card-slot" {...arrival(ARRIVAL_DELAY.card, { x: -16 })}>
				<SceneCodeCard folded={folded} onFold={fold} editor={editor} stepBuilder={stepBuilder} />
			</motion.div>

			{/* The instrument, on the stage's own centre line: fold the card and both
			    slide to the middle together. */}
			<div className="sc-dock-slot">
				<motion.div className="sc-dock-arrival" {...arrival(ARRIVAL_DELAY.dock, { y: 20 })}>
					<motion.div className="sc-dock" animate={dock} transition={settle}>
						<ExportStatus />
						<PreviewIsland onSheetRaisedChange={setSheetRaised} />
					</motion.div>
				</motion.div>
			</div>
		</div>
	);
}
