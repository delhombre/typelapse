import { addTextLayer } from "@/application/project/multimedia-authoring";
import { openStudioDocument } from "@/application/project/studio-document";
import { ConfirmDiscardOverlay } from "@/presentation/components/ui/confirm-discard";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { notify } from "@/presentation/stores/notice.store";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { importStudioMediaFiles } from "@/presentation/utils/studio-media-import";
import {
	hasStudioWorkToLose,
	openStudioProjectDocument,
} from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Add,
	BranchDown,
	ChevronRight,
	FileText,
	Image,
	Link as LinkGlyph,
	Music,
	TextInputFocus,
} from "reicon-react";
import { DiffImportMenu } from "./diff-import-menu";
import { sourcePopoverMotion } from "./source-popover-motion";
import { UrlImportMenu } from "./url-import-menu";

type SourceView = "menu" | "url" | "diff" | null;

/**
 * A project file holds references and code, never media bytes, so a real one
 * is a few hundred kilobytes. Anything past this is refused before it is read:
 * a 100 MB file used to be read, parsed and handed to the highlighter, and the
 * tab never came back.
 */
const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * One door for everything that enters a project.
 *
 * ui.camera keeps media acquisition as a single, legible action instead of a
 * row of unrelated glyphs. Typelapse has different sources, but the same
 * information architecture applies: a link, a change, and a project file are
 * three ways of answering one question — what should this project start from?
 */
export function StudioSourceHub() {
	const [view, setView] = useState<SourceView>(null);
	const [pendingFile, setPendingFile] = useState<{ name: string; json: string } | null>(null);
	const [mediaAccept, setMediaAccept] = useState("image/*,video/*");
	const [sourceStatus, setSourceStatus] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const mediaInputRef = useRef<HTMLInputElement>(null);
	const reduce = useReducedMotion() === true;
	const composition = useStudioCompositionStore();
	const selectAudioCue = useStudioCompositionSelectionStore((state) => state.selectAudioCue);

	const close = useCallback(() => setView(null), []);

	// A menu takes focus when it opens, so the arrows below have somewhere to
	// start from; a keyboard user used to tab through the page to reach it.
	useEffect(() => {
		if (view === "menu") {
			menuRef.current
				?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
				?.focus();
		}
	}, [view]);

	useEffect(() => {
		if (view === null) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			const root = rootRef.current;
			if (root && !event.composedPath().includes(root)) {
				close();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
				// The panel unmounts under the focus it holds; without this a keyboard
				// user lands on the page and starts again from the top.
				triggerRef.current?.focus();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [close, view]);

	const applyJson = useCallback((json: string, name: string) => {
		try {
			openStudioProjectDocument(json);
			feedback("commit");
		} catch (error) {
			feedback("error");
			notify(error instanceof Error ? error.message : "That file could not be read.", {
				tone: "error",
				detail: name,
			});
		}
	}, []);

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) {
				return;
			}
			if (file.size > MAX_PROJECT_FILE_BYTES) {
				event.target.value = "";
				feedback("error");
				notify("That file is too large to be a Typelapse project.", {
					tone: "error",
					detail: file.name,
				});
				return;
			}
			const reader = new FileReader();
			reader.onload = (loadEvent) => {
				const text = loadEvent.target?.result;
				if (typeof text !== "string") {
					return;
				}
				// An unreadable file is refused before anything is asked: a confirm
				// that ends in a refusal is a question nobody needed to answer.
				const unreadable = projectFileProblem(text);
				if (unreadable) {
					feedback("error");
					notify(unreadable, { tone: "error", detail: file.name });
					return;
				}
				if (hasStudioWorkToLose()) {
					setPendingFile({ name: file.name, json: text });
					return;
				}
				applyJson(text, file.name);
			};
			reader.readAsText(file);
			event.target.value = "";
		},
		[applyJson],
	);

	const addText = useCallback(() => {
		const sceneId = composition.selectedSceneId ?? composition.value.project.scenes[0]?.id;
		if (!sceneId) {
			return;
		}
		const blockId = crypto.randomUUID();
		composition.transact((project) =>
			addTextLayer(project, sceneId, {
				id: blockId,
				text: "Add your text",
				placement: { x: 0.08, y: 0.72, width: 0.84, height: 0.2 },
			}),
		);
		composition.selectBlock(sceneId, blockId);
		selectAudioCue(null);
		setSourceStatus(null);
		close();
		feedback("commit");
	}, [close, composition, selectAudioCue]);

	const openMediaPicker = useCallback((accept: string) => {
		setMediaAccept(accept);
		setSourceStatus(null);
		requestAnimationFrame(() => mediaInputRef.current?.click());
	}, []);

	const handleMediaChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const files = [...(event.target.files ?? [])];
			event.target.value = "";
			if (files.length === 0) {
				return;
			}
			setSourceStatus(
				files.length === 1 ? `Adding ${files[0]?.name}…` : `Adding ${files.length} files…`,
			);
			// Each refusal is a notice naming the file; the menu has done its job
			// either way, so it closes once the batch is through.
			setImporting(true);
			const added = await importStudioMediaFiles(files).finally(() => setImporting(false));
			setSourceStatus(null);
			close();
			feedback(added > 0 ? "commit" : "error");
		},
		[close],
	);

	const setUrlOpen = useCallback((open: boolean) => {
		setView((current) => (open ? "url" : current === "url" ? null : current));
	}, []);

	const setDiffOpen = useCallback((open: boolean) => {
		setView((current) => (open ? "diff" : current === "diff" ? null : current));
	}, []);

	return (
		<div className="sc-source-root" ref={rootRef}>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				className="hidden"
			/>
			<input
				ref={mediaInputRef}
				type="file"
				accept={mediaAccept}
				multiple
				onChange={handleMediaChange}
				className="hidden"
			/>
			<motion.button
				ref={triggerRef}
				type="button"
				aria-label="Add source"
				aria-haspopup="menu"
				aria-expanded={view !== null}
				className="sc-island-trigger sc-source-trigger"
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				onClick={() => {
					feedback("selection");
					setView((current) => (current === "menu" ? null : "menu"));
				}}
			>
				<Add size={14} aria-hidden="true" />
				<span>Add source</span>
			</motion.button>

			<AnimatePresence>
				{view === "menu" && (
					<motion.div
						ref={menuRef}
						role="menu"
						aria-label="Source options"
						onKeyDown={walkMenu}
						className="sc-source-menu"
						{...sourcePopoverMotion(reduce)}
						style={{ transformOrigin: "top left" }}
					>
						{/* No title: the button that opened the menu already says "Add source".
						    The region stays mounted so a status said later is heard. */}
						<p className="sc-source-status" aria-live="polite">
							{sourceStatus ?? ""}
						</p>
						<SourceChoice
							label="Add text"
							detail="A title, label or callout on this scene"
							icon={<TextInputFocus size={14} aria-hidden="true" />}
							onClick={addText}
						/>
						<SourceChoice
							label="Add photo or video"
							disabled={importing}
							detail="Behind or above the code"
							icon={<Image size={14} aria-hidden="true" />}
							onClick={() => openMediaPicker("image/*,video/*")}
						/>
						<SourceChoice
							label="Add audio"
							disabled={importing}
							detail="Music, voice-over or a sound cue"
							icon={<Music size={14} aria-hidden="true" />}
							onClick={() => openMediaPicker("audio/*")}
						/>
						<hr className="sc-source-divider" />
						<SourceChoice
							label="Paste a link"
							detail="Gist, GitHub file or commit"
							opensView
							icon={<LinkGlyph size={14} aria-hidden="true" />}
							onClick={() => setView("url")}
						/>
						<SourceChoice
							label="Import a change"
							detail="Git diff or pull request"
							opensView
							icon={<BranchDown size={14} aria-hidden="true" />}
							onClick={() => setView("diff")}
						/>
						<SourceChoice
							label="Open project file"
							detail="Typelapse JSON"
							icon={<FileText size={14} aria-hidden="true" />}
							onClick={() => {
								close();
								fileInputRef.current?.click();
							}}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			<UrlImportMenu
				open={view === "url"}
				onOpenChange={setUrlOpen}
				embedded
				boundaryRef={rootRef}
				onBack={() => setView("menu")}
			/>
			<DiffImportMenu
				open={view === "diff"}
				onOpenChange={setDiffOpen}
				embedded
				boundaryRef={rootRef}
				onBack={() => setView("menu")}
			/>

			<ConfirmDiscardOverlay
				open={pendingFile !== null}
				message={`Replace what you have with “${pendingFile?.name ?? ""}”?`}
				confirmLabel="Open the file"
				onCancel={() => setPendingFile(null)}
				onConfirm={() => {
					if (pendingFile) {
						applyJson(pendingFile.json, pendingFile.name);
					}
					setPendingFile(null);
				}}
			/>
		</div>
	);
}

/** Why a file cannot be opened as a project, read without touching the studio. */
function projectFileProblem(json: string): string | null {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return "That file is not valid JSON, so it is not a Typelapse project.";
	}
	try {
		openStudioDocument(data);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : "That file could not be read.";
	}
}

/** The keys a menu answers to (WAI-ARIA menu pattern): the arrows wrap, Home and End jump. */
function walkMenu(event: ReactKeyboardEvent<HTMLDivElement>): void {
	const items = [
		...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
	];
	const index = items.findIndex((item) => item === document.activeElement);
	const last = items.length - 1;
	const next =
		event.key === "ArrowDown"
			? index === last
				? 0
				: index + 1
			: event.key === "ArrowUp"
				? index <= 0
					? last
					: index - 1
				: event.key === "Home"
					? 0
					: event.key === "End"
						? last
						: null;
	if (next === null || items.length === 0) {
		return;
	}
	event.preventDefault();
	items[next]?.focus();
}

function SourceChoice({
	label,
	detail,
	icon,
	onClick,
	disabled = false,
	opensView = false,
}: {
	label: string;
	detail: string;
	icon: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	/** A chevron promises a second view; a choice that acts at once makes no such promise. */
	opensView?: boolean;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			aria-label={
				label === "Paste a link"
					? "Import from URL"
					: label === "Import a change"
						? "Import a git diff"
						: label
			}
			className="sc-source-choice"
			disabled={disabled}
			onClick={() => {
				feedback("selection");
				onClick();
			}}
		>
			<span className="sc-source-choice-icon" aria-hidden="true">
				{icon}
			</span>
			<span>
				<strong>{label}</strong>
				<small>{detail}</small>
			</span>
			{opensView ? <ChevronRight size={12} aria-hidden="true" /> : null}
		</button>
	);
}
