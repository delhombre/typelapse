import { ExportStatus } from "@/presentation/components/controls/export-status";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { StudioLayerStrip } from "@/presentation/components/editor/studio-layer-strip";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useEditorKind } from "@/presentation/hooks/use-editor-kind";
import { useStudioFileDrop } from "@/presentation/hooks/use-studio-file-drop";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Drawer } from "vaul";
import { CaptureLibrary } from "./capture-library";
import { ProjectChip } from "./project-chip";
import { StudioAccountIsland } from "./studio-account-island";
import { StudioHistoryControls } from "./studio-history-controls";
import { StudioSourceHub } from "./studio-source-hub";
import { StudioUtilities } from "./studio-utilities";
import { TemplateGallery } from "./template-gallery";

interface MobileShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

// Bottom-sheet stops: a peek handle, a mid "scenes" stage, and the full editor.
const PEEK = "56px";
const MID = 0.55;
const FULL = 0.94;
const SNAP_POINTS: (number | string)[] = [PEEK, MID, FULL];

// The drawer's own settle curve, so the instrument lands with the sheet.
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Where the instrument floats for a sheet stop: on the sheet's top edge at the
 * peek and the scenes stop, so it never sits over a scene row, and back at the
 * bottom of the screen over the full editor, whose top edge is under the chips.
 */
function dockLine(snap: number | string | null): string {
	if (snap === MID) {
		return `${MID * 100}dvh`;
	}
	if (snap === FULL) {
		return "max(12px, env(safe-area-inset-bottom))";
	}
	return PEEK;
}

/**
 * The scene, folded to one column.
 *
 * It is the same scene and not a second design: the chips are the same chips,
 * the instrument is the same instrument, and every setting is in the same four
 * clusters it is in on a desktop — the island drops its labels below 640 and
 * raises its sheets over the phone exactly as it raises them over the page. The
 * one thing that cannot float here is the code card, which has nowhere to be:
 * it becomes the bottom sheet, which is the shape a phone already has for it.
 *
 * The island sits above that sheet rather than inside it, so the transport and
 * the settings stay reachable at every snap, and the sheet only has to hold the
 * work surface.
 */
export function MobileShell({ editor, stepBuilder, preview }: MobileShellProps) {
	const [snap, setSnap] = useState<number | string | null>(PEEK);
	const [sheetRaised, setSheetRaised] = useState(false);
	const isPeek = snap === PEEK;
	const editorKind = useEditorKind();
	const reduce = useReducedMotion() === true;
	// A tablet in portrait gets this layout, and it can drag a file in from
	// another app: it lands where it does on a desktop, in the selected scene.
	const draggingFile = useStudioFileDrop();
	// The frame keeps the room above the instrument. Over the full editor it
	// keeps the scenes stop's room rather than refitting to a frame nobody sees.
	const stageLine = isPeek ? PEEK : `${MID * 100}dvh`;

	return (
		<main className="studio-root sc-root sc-root-mobile">
			<h1 className="sr-only">Typelapse studio</h1>
			{/* A phone has no room to step the stage back into, so a raised cluster
			    takes its room from the slot instead: the frame gets out of the way
			    rather than being covered by what it is being adjusted against. */}
			<div
				className="sc-stage-slot"
				style={{ paddingBottom: `calc(${stageLine} + ${sheetRaised ? 460 : 116}px)` }}
			>
				{/* The frame is the video's own shape here too: a phone used to get
				    the bare card, so a 16:9 export previewed as a wide strip. */}
				<StudioVideoModeProvider active>
					<div className="sc-stage">{preview}</div>
				</StudioVideoModeProvider>
			</div>

			{/* One row rather than two corners: at 390 the corners meet in the middle,
			    so they are laid out as what they have become — a row whose left half
			    gives up its width first. */}
			<div className="sc-corner-row">
				<ProjectChip />
				<StudioHistoryControls />
				<section className="sc-chip sc-mobile-resources" aria-label="Studio resources">
					<StudioSourceHub />
					<CaptureLibrary />
					<TemplateGallery />
				</section>
				<StudioUtilities compact />
				<StudioAccountIsland />
			</div>

			{/* The instrument floats above the sheet, on the sheet's own top edge. */}
			<div
				className="sc-dock-slot"
				style={{
					bottom: PEEK,
					transform: `translateY(calc(${PEEK} - ${dockLine(snap)}))`,
					transition: reduce ? undefined : `transform 500ms ${SHEET_EASE}`,
				}}
			>
				<div className="sc-dock">
					<ExportStatus />
					<PreviewIsland onSheetRaisedChange={setSheetRaised} />
				</div>
			</div>

			{/* Non-modal for real since vaul forwards `modal` (patches/vaul@1.1.2.patch):
			    the island and the project name outside the sheet take focus and stay
			    in the accessibility tree while it is open. */}
			<Drawer.Root
				open
				modal={false}
				dismissible={false}
				handleOnly
				repositionInputs
				snapPoints={SNAP_POINTS}
				activeSnapPoint={snap}
				setActiveSnapPoint={setSnap}
			>
				<Drawer.Portal>
					<Drawer.Content className="sc-sheet">
						<Drawer.Handle className="mx-auto !mt-3 !mb-1 !h-1.5 !w-10 !rounded-full !bg-neutral-300 dark:!bg-neutral-700" />
						<Drawer.Title className="sr-only">Code and scenes</Drawer.Title>
						<Drawer.Description className="sr-only">
							Edit code and arrange animation scenes.
						</Drawer.Description>

						<div
							className={`min-h-0 flex-1 ${isPeek ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
						>
							<motion.div
								// Over the full editor the instrument sits at the bottom of the
								// screen: the end of the sheet scrolls clear of it.
								// Landscape puts the notch on a side: the sheet's content clears it.
								className={`flex flex-col gap-6 pt-2 pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] ${
									snap === FULL
										? "pb-[calc(5rem+env(safe-area-inset-bottom))]"
										: "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
								}`}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.2 }}
							>
								<section className="flex flex-col gap-3">
									<span className="sc-eyebrow">Scenes</span>
									{stepBuilder}
								</section>

								{/* The layer row is the desktop card's toggle: once a layer is picked
								    on the stage its inspector covers the code, and the Code chip (or the
								    selected chip pressed again) is the way back. */}
								<section className="flex min-h-0 flex-col gap-3" data-editor-section>
									<span className="sc-eyebrow">{editorKind}</span>
									<StudioLayerStrip />
									<div className="h-[320px]">{editor}</div>
								</section>
							</motion.div>
						</div>
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.Root>
			<div className="sc-drop-veil" data-active={draggingFile ? "" : undefined} aria-hidden="true">
				<p>Drop to add to the selected scene</p>
			</div>
		</main>
	);
}
