import { ConfirmDiscardOverlay } from "@/presentation/components/ui/confirm-discard";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { notify } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Add, BranchDown, ChevronRight, FileText, Link as LinkGlyph } from "reicon-react";
import { DiffImportMenu } from "./diff-import-menu";
import { UrlImportMenu } from "./url-import-menu";

type SourceView = "menu" | "url" | "diff" | null;

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
	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const reduce = useReducedMotion() === true;
	const importFromJson = useSnippetStore((state) => state.importFromJson);

	const close = useCallback(() => setView(null), []);

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
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [close, view]);

	const applyJson = useCallback(
		(json: string, name: string) => {
			try {
				importFromJson(json);
				feedback("commit");
			} catch (error) {
				feedback("error");
				notify(error instanceof Error ? error.message : "That file could not be read.", {
					tone: "error",
					detail: name,
				});
			}
		},
		[importFromJson],
	);

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) {
				return;
			}
			const reader = new FileReader();
			reader.onload = (loadEvent) => {
				const text = loadEvent.target?.result;
				if (typeof text !== "string") {
					return;
				}
				if (useSnippetStore.getState().hasUnsavedEdits()) {
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
			<motion.button
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
				<Add size={13} aria-hidden="true" />
				<span>Add source</span>
			</motion.button>

			<AnimatePresence>
				{view === "menu" && (
					<motion.div
						role="menu"
						aria-label="Source options"
						className="sc-source-menu"
						initial={
							reduce ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.97, filter: "blur(4px)" }
						}
						animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.98, filter: "blur(3px)" }}
						transition={{ duration: reduce ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] }}
						style={{ transformOrigin: "top left" }}
					>
						<header>
							<strong>Add source</strong>
							<span>Choose what Typelapse should animate.</span>
						</header>
						<SourceChoice
							label="Paste a link"
							detail="Gist, GitHub file or commit"
							icon={<LinkGlyph size={14} aria-hidden="true" />}
							onClick={() => setView("url")}
						/>
						<SourceChoice
							label="Import a change"
							detail="Git diff or pull request"
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

function SourceChoice({
	label,
	detail,
	icon,
	onClick,
}: {
	label: string;
	detail: string;
	icon: ReactNode;
	onClick: () => void;
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
			<ChevronRight size={12} aria-hidden="true" />
		</button>
	);
}
