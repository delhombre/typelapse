import { ExportStatus } from "@/presentation/components/controls/export-status";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { CaptureLibrary } from "./capture-library";
import { ProjectChip } from "./project-chip";
import { StudioAccountIsland } from "./studio-account-island";
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
	const rootRef = useKeptAudible();

	return (
		<main className="studio-root sc-root sc-root-mobile" ref={rootRef}>
			<h1 className="sr-only">Typelapse studio</h1>
			{/* A phone has no room to step the stage back into, so a raised cluster
			    takes its room from the slot instead: the frame gets out of the way
			    rather than being covered by what it is being adjusted against. */}
			<div
				className="sc-stage-slot"
				style={{ paddingBottom: `calc(${PEEK} + ${sheetRaised ? 460 : 116}px)` }}
			>
				<div className="sc-stage">{preview}</div>
			</div>

			{/* One row rather than two corners: at 390 the corners meet in the middle,
			    so they are laid out as what they have become — a row whose left half
			    gives up its width first. */}
			<div className="sc-corner-row">
				<ProjectChip />
				<section className="sc-chip sc-mobile-resources" aria-label="Studio resources">
					<StudioSourceHub />
					<CaptureLibrary />
					<TemplateGallery />
				</section>
				<StudioUtilities compact />
				<StudioAccountIsland />
			</div>

			{/* The instrument floats above the sheet, on the sheet's own peek line. */}
			<div className="sc-dock-slot" style={{ bottom: PEEK }}>
				<div className="sc-dock">
					<ExportStatus />
					<PreviewIsland onSheetRaisedChange={setSheetRaised} />
				</div>
			</div>

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
								className="flex flex-col gap-6 px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.2 }}
							>
								<section className="flex flex-col gap-3">
									<span className="sc-eyebrow">Scenes</span>
									{stepBuilder}
								</section>

								<section className="flex min-h-0 flex-col gap-3">
									<span className="sc-eyebrow">Code</span>
									<div className="h-[320px]">{editor}</div>
								</section>
							</motion.div>
						</div>
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.Root>
		</main>
	);
}

/**
 * Keeps the scene audible while the sheet is open.
 *
 * The drawer is declared non-modal and permanently open, because the preview
 * behind it has to keep updating while you work — but it marks everything
 * outside itself `aria-hidden` all the same. That was survivable while the only
 * thing outside was a preview and a top bar. It is not now: the island outside
 * the sheet holds the transport and all four clusters, and a screen reader was
 * being told none of it exists.
 *
 * So the attribute comes back off, and an observer takes it off again each time
 * it returns. Nothing is being misreported: there is no modal on this screen,
 * and everything on it really is reachable.
 */
function useKeptAudible() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node) {
			return;
		}
		const reveal = () => {
			if (node.getAttribute("aria-hidden") === "true") {
				node.removeAttribute("aria-hidden");
			}
		};
		reveal();
		const observer = new MutationObserver(reveal);
		observer.observe(node, { attributes: true, attributeFilter: ["aria-hidden"] });
		return () => observer.disconnect();
	}, []);

	return ref;
}
