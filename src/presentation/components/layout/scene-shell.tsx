import {
	CARD_SLOT,
	STAGE_FLOOR_HEIGHT,
	dockTransform,
	stageSqueezeVars,
	stageTransform,
} from "@/application/layout/scene-stage";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { StudioControlRail } from "@/presentation/components/controls/studio-control-rail";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { trigger } from "@/presentation/haptics";
import { useStudioFileDrop } from "@/presentation/hooks/use-studio-file-drop";
import { springs } from "@/presentation/motion";
import {
	openingCodeFolded,
	readShellPreferences,
	writeShellPreferences,
} from "@/presentation/utils/shell-preferences";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useCallback, useState } from "react";
import { CaptureLibrary } from "./capture-library";
import { ProjectChip } from "./project-chip";
import { SceneCodeCard } from "./scene-code-card";
import { StudioAccountIsland } from "./studio-account-island";
import { StudioHistoryControls } from "./studio-history-controls";
import { StudioSourceHub } from "./studio-source-hub";
import { StudioUtilities } from "./studio-utilities";
import { TemplateGallery } from "./template-gallery";

interface SceneShellProps {
	editor: ReactNode;
	sceneInspector: ReactNode;
	preview: ReactNode;
	/** How many scenes the project had when the studio opened: none opens in Edit. */
	sceneCount: number;
}

const ARRIVAL_DELAY = { stage: 0, rail: 0.06, chrome: 0.1, editor: 0.14 } as const;

/**
 * A scene-table studio: the video is the object, the timeline is its permanent
 * history, and editing is a temporary sheet rather than a column the preview
 * must carry forever.
 */
export function SceneShell({ editor, sceneInspector, preview, sceneCount }: SceneShellProps) {
	const reduce = useReducedMotion() === true;
	const [folded, setFolded] = useState(() =>
		openingCodeFolded(sceneCount, readShellPreferences().codeFolded),
	);
	const draggingFile = useStudioFileDrop();

	const fold = useCallback((next: boolean) => {
		trigger("light");
		setFolded(next);
		writeShellPreferences({ codeFolded: next });
	}, []);

	const stageTo = stageTransform({ folded }, reduce);
	const stage = { x: stageTo.x, y: stageTo.y, scale: stageTo.scale };
	const rail = { x: dockTransform({ folded }).x };
	const settle = reduce ? { duration: 0 } : springs.default;

	const arrival = (delay: number, from: { x?: number; y?: number; scale?: number }) => {
		if (reduce) {
			return {
				initial: { opacity: 0 },
				animate: { opacity: 1 },
				transition: { duration: 0.18 },
			};
		}
		return {
			initial: { opacity: 0, x: 0, y: 0, scale: 1, ...from },
			animate: { opacity: 1, x: 0, y: 0, scale: 1 },
			transition: { ...springs.gentle, delay },
		};
	};

	return (
		<StudioVideoModeProvider active>
			<main
				className="studio-root sc-root studio-camera-root"
				data-editor-open={folded ? undefined : ""}
				style={
					{
						"--sc-card-width": `${CARD_SLOT}px`,
						"--sc-stage-floor": `${STAGE_FLOOR_HEIGHT}px`,
						...stageSqueezeVars(),
					} as CSSProperties
				}
			>
				<h1 className="sr-only">Typelapse studio</h1>
				<header className="studio-camera-header">
					<motion.div
						className="sc-corner sc-corner-left"
						{...arrival(ARRIVAL_DELAY.chrome, { y: -8 })}
					>
						<div className="sc-island-group sc-island-group-project">
							<ProjectChip />
							<StudioHistoryControls />
							<StudioSourceHub />
							<CaptureLibrary />
						</div>
					</motion.div>

					<WorkspaceMode preview={folded} onChange={fold} reduce={reduce} />

					<motion.div
						className="sc-corner sc-corner-right"
						{...arrival(ARRIVAL_DELAY.chrome, { y: -8 })}
					>
						<div className="sc-island-group sc-island-group-utilities">
							<TemplateGallery />
							<StudioUtilities />
							<StudioAccountIsland />
						</div>
					</motion.div>
				</header>

				<div className="sc-stage-slot">
					<motion.div
						className="sc-stage-arrival"
						{...arrival(ARRIVAL_DELAY.stage, { scale: 0.985 })}
					>
						<motion.div className="sc-stage" animate={stage} transition={settle}>
							{preview}
						</motion.div>
					</motion.div>
				</div>

				<motion.div className="sc-card-slot" {...arrival(ARRIVAL_DELAY.editor, { x: -16 })}>
					<SceneCodeCard
						folded={folded}
						onFold={fold}
						editor={editor}
						sceneInspector={sceneInspector}
					/>
				</motion.div>

				<div className="sc-dock-slot">
					<motion.div className="sc-dock-arrival" {...arrival(ARRIVAL_DELAY.rail, { y: 18 })}>
						<motion.div className="sc-dock" animate={rail} transition={settle}>
							<ExportStatus />
							<StudioControlRail />
						</motion.div>
					</motion.div>
				</div>

				<div className="sc-timeline-slot">
					<StudioTimeline />
				</div>
				<div
					className="sc-drop-veil"
					data-active={draggingFile ? "" : undefined}
					aria-hidden="true"
				>
					<p>Drop to add to the selected scene</p>
				</div>
			</main>
		</StudioVideoModeProvider>
	);
}

function WorkspaceMode({
	preview,
	onChange,
	reduce,
}: {
	preview: boolean;
	onChange: (preview: boolean) => void;
	reduce: boolean;
}) {
	return (
		<LayoutGroup id="studio-workspace-mode">
			<fieldset className="studio-camera-mode" aria-label="Workspace mode">
				<WorkspaceModeButton active={preview} onClick={() => onChange(true)} reduce={reduce}>
					Preview
				</WorkspaceModeButton>
				<WorkspaceModeButton active={!preview} onClick={() => onChange(false)} reduce={reduce}>
					Edit
				</WorkspaceModeButton>
			</fieldset>
		</LayoutGroup>
	);
}

function WorkspaceModeButton({
	active,
	onClick,
	reduce,
	children,
}: {
	active: boolean;
	onClick: () => void;
	reduce: boolean;
	children: ReactNode;
}) {
	return (
		<button type="button" aria-pressed={active} onClick={onClick}>
			{active && (
				<motion.span
					layoutId="active-plate"
					className="studio-camera-mode-plate"
					transition={reduce ? { duration: 0 } : springs.snappy}
				/>
			)}
			<span className="studio-camera-mode-label">{children}</span>
		</button>
	);
}
