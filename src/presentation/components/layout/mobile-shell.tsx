import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Drawer } from "vaul";
import { ExportButton, ExportOptions, PngButton } from "../settings/export-bar";
import { SettingsStrip } from "../settings/settings-panel";
import { TopNav } from "./top-nav";

interface MobileShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

// Bottom-sheet stops: a peek toolbar, a mid "style + export" stage, and the full editor.
const PEEK = "128px";
const MID = 0.62;
const FULL = 0.96;
const SNAP_POINTS: (number | string)[] = [PEEK, MID, FULL];

/**
 * Mobile / tablet workspace (below lg). The live preview owns the screen and a
 * non-modal Vaul drawer holds the controls, so the preview keeps updating,
 * WYSIWYG, while you drag the sheet up to style, edit steps, or write code.
 */
export function MobileShell({ editor, stepBuilder, preview }: MobileShellProps) {
	const [snap, setSnap] = useState<number | string | null>(PEEK);
	const title = useSnippetStore((s) => s.snippet.title);
	const hasSteps = useSnippetStore((s) => s.snippet.steps.length >= 2);
	const isPeek = snap === PEEK;

	return (
		<div className="studio-root flex h-dvh w-full flex-col overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<TopNav />

			{/* Preview owns the space above the drawer peek. */}
			<main className="relative min-h-0 flex-1 overflow-hidden" style={{ paddingBottom: PEEK }}>
				{preview}
			</main>

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
					<Drawer.Content className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[97%] flex-col rounded-t-[22px] border-t border-neutral-200/80 bg-white/85 shadow-[0_-8px_40px_-12px_rgb(0_0_0/0.25)] backdrop-blur-2xl backdrop-saturate-150 dark:border-neutral-800/80 dark:bg-neutral-950/85">
						<Drawer.Handle className="mx-auto !mt-3 !mb-1 !h-1.5 !w-10 !rounded-full !bg-neutral-300 dark:!bg-neutral-700" />
						<Drawer.Title className="sr-only">Editor controls</Drawer.Title>

						{/* Peek header, always visible: snippet + the primary actions. */}
						<div className="flex items-center gap-2 px-4 pt-1 pb-3">
							<span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">
								{title.trim() || "Untitled"}
							</span>
							<PngButton />
							{hasSteps && <ExportButton />}
						</div>

						{/* Scrollable as soon as the sheet is expanded; clipped at the peek so only
						    the toolbar shows. handleOnly keeps this scroll from fighting the drag. */}
						<div
							className={`min-h-0 flex-1 ${isPeek ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
						>
							<motion.div
								className="flex flex-col gap-6 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.2 }}
							>
								{/* Style first: its changes are live in the preview above at the mid snap. */}
								<SheetSection label="Style">
									<SettingsStrip />
								</SheetSection>

								{hasSteps && (
									<SheetSection label="Export">
										<div className="flex flex-wrap items-center gap-2 px-5">
											<ExportOptions />
										</div>
									</SheetSection>
								)}

								<SheetSection label="Steps">
									<div className="px-5">{stepBuilder}</div>
								</SheetSection>

								<SheetSection label="Code">
									<div className="h-[320px] px-5">{editor}</div>
								</SheetSection>
							</motion.div>
						</div>
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.Root>
		</div>
	);
}

/** A labelled block inside the sheet. The label sits at the shared px-5 gutter. */
function SheetSection({ label, children }: { label: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<span className="px-5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
				{label}
			</span>
			{children}
		</section>
	);
}
