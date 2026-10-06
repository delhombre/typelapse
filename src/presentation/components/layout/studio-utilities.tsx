import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useInterfaceFeedbackStore } from "@/presentation/stores/interface-feedback.store";
import { notify } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { saveJsonFile } from "@/presentation/utils/save-json-file";
import {
	copyToClipboard,
	encodeShareLink,
	openShareLinkOnBoot,
} from "@/presentation/utils/share-link";
import { studioProjectFileJson } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Download, Moon, MoreH, Share, Sun, VolumeHigh, VolumeMute } from "reicon-react";

/**
 * Quiet, global utilities that affect the whole studio.
 * Sources and destinations have their own named islands; this cluster stays
 * compact because every control here is a familiar, reversible action.
 */
export function StudioUtilities({ compact = false }: { compact?: boolean } = {}) {
	const { mode, toggle } = useThemeModeStore();
	const snippetTitle = useSnippetStore((s) => s.snippet.title);
	const importFromJson = useSnippetStore((s) => s.importFromJson);
	const interfaceFeedback = useInterfaceFeedbackStore((s) => s.enabled);
	const setInterfaceFeedback = useInterfaceFeedbackStore((s) => s.setEnabled);
	const [shareCopied, setShareCopied] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const menuTriggerRef = useRef<HTMLButtonElement>(null);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
		menuTriggerRef.current?.focus();
	}, []);

	// Load from share link on mount
	useEffect(() => {
		openShareLinkOnBoot(importFromJson);
	}, [importFromJson]);

	useEffect(() => {
		if (!compact || !menuOpen) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			if (rootRef.current && !event.composedPath().includes(rootRef.current)) {
				closeMenu();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeMenu();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [closeMenu, compact, menuOpen]);

	const handleShare = useCallback(async () => {
		// One producer of the project format: the link carries exactly what a JSON
		// export carries, so the two can never drift apart.
		const link = encodeShareLink(useSnippetStore.getState().toProjectPayload());
		const copied = await copyToClipboard(link);
		if (copied) {
			feedback("success");
			setShareCopied(true);
			setTimeout(() => setShareCopied(false), 2000);
		}
	}, []);

	const handleFeedbackToggle = useCallback(() => {
		// Let the last cue be heard when turning feedback off, and the first one
		// be heard when turning it on. The tactile half fires in both directions.
		if (interfaceFeedback) {
			feedback("toggle");
			setInterfaceFeedback(false);
			return;
		}
		setInterfaceFeedback(true);
		feedback("toggle");
	}, [interfaceFeedback, setInterfaceFeedback]);

	const handleThemeToggle = useCallback(() => {
		toggle();
		feedback("toggle");
	}, [toggle]);

	const handleExport = useCallback(() => {
		const json = studioProjectFileJson();
		saveJsonFile(json, snippetTitle);
		feedback("commit");
		// The file is the whole V2 project, but it names its media by reference and
		// never carries the bytes. Say so at the moment of saving, so the file is
		// never mistaken for a complete backup (contract: an export that leaves
		// media behind must carry an explicit warning).
		if ((JSON.parse(json) as ProjectDocumentV2).project.assets.length > 0) {
			notify("Saved the project without its media files.", {
				tone: "info",
				detail: "Images, video and audio stay on this device and open as unavailable elsewhere.",
			});
		}
	}, [snippetTitle]);

	return (
		<div ref={rootRef} className={`sc-chip sc-utilities ${compact ? "sc-utilities-compact" : ""}`}>
			{compact ? (
				<>
					<StudioTooltip content="More" side="bottom">
						<motion.button
							ref={menuTriggerRef}
							type="button"
							onClick={() => {
								feedback("selection");
								setMenuOpen((current) => !current);
							}}
							whileTap={{ scale: 0.97 }}
							transition={springs.snappy}
							className="hit-ext sc-glyph-button"
							aria-label="More actions"
							aria-haspopup="menu"
							aria-expanded={menuOpen}
						>
							<MoreH size={13} aria-hidden="true" />
						</motion.button>
					</StudioTooltip>
					<AnimatePresence>
						{menuOpen && (
							<motion.div
								role="menu"
								aria-label="More actions"
								className="sc-utility-overflow-menu"
								initial={{ opacity: 0, y: -4, scale: 0.97, filter: "blur(3px)" }}
								animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
								exit={{
									opacity: 0,
									y: -3,
									scale: 0.98,
									filter: "blur(3px)",
									transition: { duration: 0.11, ease: [0.4, 0, 1, 1] },
								}}
								transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
								style={{ transformOrigin: "top right" }}
							>
								<button type="button" role="menuitem" onClick={handleExport}>
									<Download size={14} aria-hidden="true" />
									<span>Export project file</span>
								</button>
								<button type="button" role="menuitem" onClick={() => void handleShare()}>
									{shareCopied ? (
										<Check size={14} aria-hidden="true" />
									) : (
										<Share size={14} aria-hidden="true" />
									)}
									<span>{shareCopied ? "Link copied" : "Copy share link"}</span>
								</button>
								{/* A phone's top row also carries undo and redo, so the two
								    set-once toggles wait in here rather than take the name's room. */}
								<button type="button" role="menuitem" onClick={handleThemeToggle}>
									{mode === "dark" ? (
										<Sun size={14} aria-hidden="true" />
									) : (
										<Moon size={14} aria-hidden="true" />
									)}
									<span>{mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
								</button>
								<button type="button" role="menuitem" onClick={handleFeedbackToggle}>
									{interfaceFeedback ? (
										<VolumeHigh size={14} aria-hidden="true" />
									) : (
										<VolumeMute size={14} aria-hidden="true" />
									)}
									<span>
										{interfaceFeedback ? "Mute interface feedback" : "Enable interface feedback"}
									</span>
								</button>
							</motion.div>
						)}
					</AnimatePresence>
				</>
			) : (
				<>
					<UtilityButton
						onClick={handleExport}
						label="Export project file"
						tooltip="Export project file"
					>
						<Download size={14} aria-hidden="true" />
					</UtilityButton>
					<UtilityButton
						onClick={handleShare}
						label={shareCopied ? "Link copied" : "Copy share link"}
						tooltip={shareCopied ? "Link copied" : "Share link"}
						active={shareCopied}
					>
						{shareCopied ? (
							<Check size={14} aria-hidden="true" />
						) : (
							<Share size={14} aria-hidden="true" />
						)}
					</UtilityButton>
					<UtilityButton
						onClick={handleThemeToggle}
						label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
						tooltip={`Appearance · ${mode === "dark" ? "Dark" : "Light"}`}
					>
						{mode === "dark" ? (
							<Sun size={14} aria-hidden="true" />
						) : (
							<Moon size={14} aria-hidden="true" />
						)}
					</UtilityButton>
					<UtilityButton
						onClick={handleFeedbackToggle}
						label={interfaceFeedback ? "Mute interface feedback" : "Enable interface feedback"}
						tooltip={`Sound & haptics · ${interfaceFeedback ? "On" : "Off"}`}
						active={interfaceFeedback}
					>
						{interfaceFeedback ? (
							<VolumeHigh size={14} aria-hidden="true" />
						) : (
							<VolumeMute size={14} aria-hidden="true" />
						)}
					</UtilityButton>
				</>
			)}
		</div>
	);
}

/* ──────────── Primitives ──────────── */

function UtilityButton({
	onClick,
	label,
	tooltip,
	active,
	children,
}: {
	onClick: () => void;
	label: string;
	tooltip: string;
	active?: boolean;
	children: ReactNode;
}) {
	return (
		<StudioTooltip content={tooltip} side="bottom">
			<motion.button
				type="button"
				onClick={onClick}
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				className={`hit-ext sc-glyph-button ${active ? "sc-glyph-button-active" : ""}`}
				aria-label={label}
			>
				{children}
			</motion.button>
		</StudioTooltip>
	);
}
