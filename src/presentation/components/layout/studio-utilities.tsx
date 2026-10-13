import type { MovableResource } from "@/application/layout/corner-row";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useHelpRequestStore } from "@/presentation/stores/help-request.store";
import { useInterfaceFeedbackStore } from "@/presentation/stores/interface-feedback.store";
import { useLibraryRequestStore } from "@/presentation/stores/library-request.store";
import { notify } from "@/presentation/stores/notice.store";
import { useShowcaseRequestStore } from "@/presentation/stores/showcase-request.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	NEXT_PREFERENCE,
	type ThemePreference,
	useThemeModeStore,
} from "@/presentation/stores/theme-mode.store";
import { saveJsonFile } from "@/presentation/utils/save-json-file";
import {
	copyToClipboard,
	encodeShareLink,
	openShareLinkOnBoot,
} from "@/presentation/utils/share-link";
import { studioProjectFileJson } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
	Check,
	Download,
	Grid,
	HelpCircle,
	Home,
	Library,
	Monitor,
	Moon,
	MoreH,
	Share,
	Sun,
	VolumeHigh,
	VolumeMute,
} from "reicon-react";
import { HelpSheet } from "./help-sheet";
import { NewDot, useUnreadChanges } from "./new-mark";

/** The three appearances, in the order the control gives them. */
const APPEARANCES: readonly { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
	{ value: "system", label: "System", Icon: Monitor },
];

const APPEARANCE_LABEL: Record<ThemePreference, string> = {
	light: "Light",
	dark: "Dark",
	system: "System",
};

interface StudioUtilitiesProps {
	/** The phone's form: one More button and a menu. */
	compact?: boolean;
	/**
	 * The menu's first section, on the phone: the account lives here rather than
	 * as a fifth chip in a row planned for four (design audit 2026-10-08, D3).
	 */
	leading?: ReactNode;
	/**
	 * The resources the corner row gave up, top to bottom (`cornerRowPlan`): each
	 * is a row that asks the sheet it stands for to open.
	 */
	resources?: readonly MovableResource[];
	/** A way back to the home page, for the phone chip that no longer holds a link. */
	homeLink?: boolean;
}

/** The rows of the resources a phone keeps in More: what each is called, and how it is asked for. */
const MORE_RESOURCES = {
	showcase: { label: "Showcase", Icon: Grid, store: useShowcaseRequestStore },
	library: { label: "Library", Icon: Library, store: useLibraryRequestStore },
} as const;

/**
 * Quiet, global utilities that affect the whole studio.
 * Sources and destinations have their own named islands; this cluster stays
 * compact because every control here is a familiar, reversible action.
 */
export function StudioUtilities({
	compact = false,
	leading,
	resources = [],
	homeLink = false,
}: StudioUtilitiesProps = {}) {
	const preference = useThemeModeStore((s) => s.preference);
	const setPreference = useThemeModeStore((s) => s.setPreference);
	const cycleAppearance = useThemeModeStore((s) => s.cycle);
	const menuId = useId();
	const snippetTitle = useSnippetStore((s) => s.snippet.title);
	const importFromJson = useSnippetStore((s) => s.importFromJson);
	const interfaceFeedback = useInterfaceFeedbackStore((s) => s.enabled);
	const setInterfaceFeedback = useInterfaceFeedbackStore((s) => s.setEnabled);
	const [shareCopied, setShareCopied] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const hasNews = useUnreadChanges().length > 0;
	const newsId = useId();
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
		// A row drawn into the menu from outside it (the account's) that opens a modal
		// sheet closes the menu first, as the resources' rows do; the sheet hands focus
		// back to the menu's button. A DOM listener: the row is a portal of another tree.
		const root = rootRef.current;
		const onClick = (event: Event) => {
			if ((event.target as Element | null)?.closest?.("[data-dismiss-menu]")) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		root?.addEventListener("click", onClick);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			root?.removeEventListener("click", onClick);
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

	const handleAppearanceCycle = useCallback(() => {
		cycleAppearance();
		feedback("toggle");
	}, [cycleAppearance]);

	const handleAppearance = useCallback(
		(next: ThemePreference) => {
			if (next === preference) return;
			setPreference(next);
			feedback("selection");
		},
		[preference, setPreference],
	);

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
							data-menu-trigger=""
							aria-describedby={hasNews ? newsId : undefined}
							aria-expanded={menuOpen}
							aria-controls={menuOpen ? menuId : undefined}
						>
							<MoreH size={13} aria-hidden="true" />
							{hasNews && <NewDot />}
						</motion.button>
					</StudioTooltip>
					<AnimatePresence>
						{menuOpen && (
							// A disclosure, not an ARIA menu: it holds the account's form and a
							// segmented control, which a menu's roles cannot.
							<motion.div
								id={menuId}
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
								{leading}
								{resources.map((id) => {
									const { label, Icon, store } = MORE_RESOURCES[id];
									return (
										<button
											key={id}
											type="button"
											onClick={() => {
												feedback("selection");
												// The sheet is modal and portaled: the menu goes first, and the
												// sheet hands focus back to this button when it closes.
												setMenuOpen(false);
												store.getState().request(menuTriggerRef.current);
											}}
										>
											<Icon size={14} aria-hidden="true" />
											<span>{label}</span>
										</button>
									);
								})}
								{/* Help is always here, whichever pointer: it is not a resource the
								    corner row gives up, it was never in the row. */}
								<button
									type="button"
									aria-describedby={hasNews ? newsId : undefined}
									onClick={() => {
										feedback("selection");
										setMenuOpen(false);
										useHelpRequestStore.getState().request(menuTriggerRef.current);
									}}
								>
									<HelpCircle size={14} aria-hidden="true" />
									<span>Help</span>
									{hasNews && <NewDot />}
								</button>
								<button type="button" onClick={handleExport}>
									<Download size={14} aria-hidden="true" />
									<span>Export project file</span>
								</button>
								<button type="button" onClick={() => void handleShare()}>
									{shareCopied ? (
										<Check size={14} aria-hidden="true" />
									) : (
										<Share size={14} aria-hidden="true" />
									)}
									<span>{shareCopied ? "Link copied" : "Copy share link"}</span>
								</button>
								{/* A phone's top row also carries undo and redo, so the two
								    set-once settings wait in here rather than take the name's room.
								    The appearance is three states, System by default: one tap on a
								    two-state toggle used to pin a side for good (D6). */}
								<fieldset className="sc-appearance">
									<legend>Appearance</legend>
									<div>
										{APPEARANCES.map((option) => (
											<button
												key={option.value}
												type="button"
												aria-pressed={preference === option.value}
												onClick={() => handleAppearance(option.value)}
											>
												<span>{option.label}</span>
											</button>
										))}
									</div>
								</fieldset>
								<button type="button" onClick={handleFeedbackToggle}>
									{interfaceFeedback ? (
										<VolumeHigh size={14} aria-hidden="true" />
									) : (
										<VolumeMute size={14} aria-hidden="true" />
									)}
									<span>
										{interfaceFeedback ? "Mute interface feedback" : "Enable interface feedback"}
									</span>
								</button>
								{homeLink && (
									<>
										<hr />
										<Link to="/">
											<Home size={14} aria-hidden="true" />
											<span>Back to home</span>
										</Link>
									</>
								)}
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
						onClick={handleAppearanceCycle}
						label={`Appearance: ${APPEARANCE_LABEL[preference]}. Switch to ${APPEARANCE_LABEL[NEXT_PREFERENCE[preference]]}`}
						tooltip={`Appearance · ${APPEARANCE_LABEL[preference]}`}
					>
						<AppearanceGlyph preference={preference} />
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
					<UtilityButton
						onClick={(event) => {
							feedback("selection");
							useHelpRequestStore.getState().request(event.currentTarget);
						}}
						label="Help"
						tooltip={hasNews ? "Help · something is new" : "Help"}
						describedBy={hasNews ? newsId : undefined}
					>
						<HelpCircle size={14} aria-hidden="true" />
						{hasNews && <NewDot />}
					</UtilityButton>
				</>
			)}
			{/* What the Help control describes itself with while the dot is up: a description
			    and not part of its name, so "Help" stays the name. */}
			{hasNews && (
				<span id={newsId} className="sr-only">
					New: there is something in What's new.
				</span>
			)}
			<HelpSheet />
		</div>
	);
}

/* ──────────── Primitives ──────────── */

function AppearanceGlyph({ preference }: { preference: ThemePreference }) {
	const Icon = APPEARANCES.find((option) => option.value === preference)?.Icon ?? Monitor;
	return <Icon size={14} aria-hidden="true" />;
}

function UtilityButton({
	onClick,
	label,
	tooltip,
	active,
	describedBy,
	children,
}: {
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	label: string;
	tooltip: string;
	active?: boolean;
	describedBy?: string | undefined;
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
				aria-describedby={describedBy}
			>
				{children}
			</motion.button>
		</StudioTooltip>
	);
}
