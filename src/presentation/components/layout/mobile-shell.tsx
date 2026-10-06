import {
	DOCK_ROOM,
	type PhoneSheetStep,
	type PhoneSheetStop,
	phoneSheetGeometry,
} from "@/application/layout/phone-sheet";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { StudioLayerStrip } from "@/presentation/components/editor/studio-layer-strip";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useDockFollowsSheet } from "@/presentation/hooks/use-dock-follows-sheet";
import { useEditorKind } from "@/presentation/hooks/use-editor-kind";
import { usePhoneViewport } from "@/presentation/hooks/use-phone-viewport";
import { useStudioFileDrop } from "@/presentation/hooks/use-studio-file-drop";
import { motion } from "motion/react";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
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

/** What the handle says its state is: what the sheet shows, in words, not the stop's name. */
const STOP_TEXT: Record<PhoneSheetStop, string> = {
	peek: "Collapsed",
	scenes: "Half open",
	full: "Open",
};

/** The handle is a slider (a vertical one: up is more sheet), and Enter and Space step through. */
const HANDLE_KEYS: Record<string, PhoneSheetStep> = {
	ArrowUp: "raise",
	ArrowRight: "raise",
	PageUp: "raise",
	ArrowDown: "lower",
	ArrowLeft: "lower",
	PageDown: "lower",
	Home: "first",
	End: "last",
	Enter: "cycle",
	" ": "cycle",
};

/**
 * The scene, folded to one column.
 *
 * It is the same scene and not a second design: the chips are the same chips,
 * the instrument is the same instrument, and every setting is in the same four
 * clusters it is in on a desktop: the island drops its labels below 640 and
 * raises its sheets over the phone exactly as it raises them over the page. The
 * one thing that cannot float here is the code card, which has nowhere to be:
 * it becomes the bottom sheet, which is the shape a phone already has for it.
 *
 * The island sits above that sheet rather than inside it, so the transport and
 * the settings stay reachable at every snap, and the sheet only has to hold the
 * work surface.
 */
export function MobileShell({ editor, stepBuilder, preview }: MobileShellProps) {
	// The stops are pixels from the viewport and its safe areas (application/
	// layout/phone-sheet.ts): a phone on its side has no scenes stop, and the
	// sheet is held by the name of its stop so a rotation keeps it there.
	const viewport = usePhoneViewport();
	const sheet = useMemo(() => phoneSheetGeometry(viewport), [viewport]);
	const [wanted, setWanted] = useState<PhoneSheetStop>("peek");
	const stop = sheet.resolve(wanted);
	// An island panel needs the room the sheet takes: the sheet goes down to the
	// peek while one is open, so the frame stays above it at its own size, and
	// comes back to the stop it left when the panel closes, unless a hand moved it
	// in between (DECISIONS D4). The stage's slot never changes for a panel.
	const wantedRef = useRef(wanted);
	wantedRef.current = wanted;
	const stopBeforePanel = useRef<PhoneSheetStop | null>(null);
	const onPanelOpenChange = useCallback((open: boolean) => {
		if (open) {
			stopBeforePanel.current ??= wantedRef.current;
			setWanted("peek");
			return;
		}
		const back = stopBeforePanel.current;
		stopBeforePanel.current = null;
		if (back) setWanted((now) => (now === "peek" ? back : now));
	}, []);
	// One array per geometry: vaul recomputes its offsets whenever the identity
	// of `snapPoints` changes, so a fresh array each render would re-measure it.
	const [stopNames, snapPoints] = useMemo(
		() => [sheet.order, sheet.order.map((name) => `${sheet.stops[name]}px`)] as const,
		[sheet],
	);
	// The sheet is portaled out of this tree, so its element arrives through a ref;
	// the instrument follows it from there (hooks/use-dock-follows-sheet.ts).
	const [sheetElement, setSheetElement] = useState<HTMLElement | null>(null);
	const dockRef = useRef<HTMLDivElement>(null);
	useDockFollowsSheet(sheetElement, dockRef, sheet);
	const contentId = useId();
	const isPeek = stop === "peek";
	const editorKind = useEditorKind();
	// A tablet in portrait gets this layout, and it can drag a file in from
	// another app: it lands where it does on a desktop, in the selected scene.
	const draggingFile = useStudioFileDrop();
	// The frame keeps the room above the instrument. Over the full editor it
	// keeps the scenes stop's room rather than refitting to a frame nobody sees.
	const stageLift = sheet.stageLift(stop);

	return (
		<main className="studio-root sc-root sc-root-mobile">
			<h1 className="sr-only">Typelapse studio</h1>
			{/* The slot's room is the sheet's and the instrument's, and nothing an
			    island panel opens: a phone has no room to step the stage back into,
			    and a slot asked for 460px more than the screen has left collapses to
			    a box of nothing, which the card refits into at a negative offset
			    (#169). A raised cluster lowers the sheet instead (above). */}
			<div className="sc-stage-slot" style={{ paddingBottom: stageLift + DOCK_ROOM }}>
				{/* The frame is the video's own shape here too: a phone used to get
				    the bare card, so a 16:9 export previewed as a wide strip. */}
				<StudioVideoModeProvider active>
					<div className="sc-stage">{preview}</div>
				</StudioVideoModeProvider>
			</div>

			{/* One row rather than two corners: at 390 the corners meet in the middle,
			    so they are laid out as what they have become, a row whose left half
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
			<div className="sc-dock-slot" ref={dockRef}>
				<div className="sc-dock">
					<ExportStatus />
					<PreviewIsland onPanelOpenChange={onPanelOpenChange} />
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
				snapPoints={snapPoints}
				activeSnapPoint={snapPoints[stopNames.indexOf(stop)] ?? null}
				setActiveSnapPoint={(point) => {
					// A tap on the handle asks for the stop after the last: that is the peek.
					const name =
						point === undefined
							? sheet.step(stop, "cycle")
							: stopNames[snapPoints.indexOf(String(point))];
					if (name) setWanted(name);
				}}
			>
				<Drawer.Portal>
					<Drawer.Content className="sc-sheet" ref={setSheetElement}>
						{/* The handle darkens under the finger that holds it: the press is the
						    only feedback a drag gets before the sheet moves. */}
						<Drawer.Handle
							role="slider"
							tabIndex={0}
							// The drawer hides its handle from assistive technology; this one is
							// the way to the content below the peek, so it is named and adjustable.
							aria-hidden={undefined}
							aria-label="Sheet height"
							aria-orientation="vertical"
							aria-valuemin={0}
							aria-valuemax={stopNames.length - 1}
							aria-valuenow={stopNames.indexOf(stop)}
							aria-valuetext={STOP_TEXT[stop]}
							aria-controls={contentId}
							onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
								const step = HANDLE_KEYS[event.key];
								if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
								event.preventDefault();
								setWanted(sheet.step(stop, step));
							}}
							className="mx-auto !mt-3 !mb-1 !h-1.5 !w-10 !rounded-full !bg-neutral-300 transition-[background-color] duration-150 active:!bg-neutral-400 dark:!bg-neutral-700 dark:active:!bg-neutral-500 focus-visible:!opacity-100"
						/>
						<Drawer.Title className="sr-only">Code and scenes</Drawer.Title>
						<Drawer.Description className="sr-only">
							Edit code and arrange animation scenes.
						</Drawer.Description>

						{/* Collapsed, the content is below the screen: it is out of the tab order
						    and the accessibility tree until the handle raises the sheet, so focus
						    never lands on something nobody can see. Rows scrolled up dissolve
						    under the handle instead of being cut flat across it; the 12px fade
						    sits in the content's top padding, so at rest nothing is faded. */}
						<div
							id={contentId}
							inert={isPeek}
							// The sheet is as tall as the screen and slides, so at the half stop its
							// lower part is below the screen's edge: a key that focuses something
							// there raises the sheet, so focus is never somewhere nobody can see.
							onFocus={(event) => {
								if (
									stop !== "full" &&
									event.target.getBoundingClientRect().bottom > window.innerHeight
								) {
									setWanted("full");
								}
							}}
							className={`min-h-0 flex-1 [mask-image:linear-gradient(to_bottom,transparent,black_12px)] ${isPeek ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
						>
							<motion.div
								// Over the full editor the instrument sits at the bottom of the
								// screen: the end of the sheet scrolls clear of it.
								// Landscape puts the notch on a side: the sheet's content clears it.
								className={`flex flex-col gap-6 pt-3 pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] ${
									stop === "full"
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
