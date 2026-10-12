import { classifySource } from "@/application/import/classify-source";
import { importConfirmLabel, importReplaceQuestion } from "@/application/import/import-wording";
import { resolvePrUrl } from "@/application/import/pr-url";
import { BusyLabel } from "@/presentation/components/ui/busy-label";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { type ImportPlayMode, useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { hasStudioWorkToLose } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { BranchDown, ChevronLeft } from "reicon-react";
import { SourceError } from "./source-error";
import { sourcePopoverMotion } from "./source-popover-motion";

const IMPORT_MODES: { key: ImportPlayMode; label: string }[] = [
	{ key: "whole", label: "Whole change" },
	{ key: "commit", label: "By commit" },
];

/**
 * Popover that turns a paste into an animated walkthrough. What the paste *is*
 * — a PR, a commit, a code URL, a raw diff — is decided by `useSourceImport`,
 * the same reader the landing hero pastes into, so the two cannot drift. A PR
 * URL also offers a "By commit" mode that chapters the walkthrough one segment
 * per commit. That choice is why the URL importer hands its pull requests over
 * here rather than refusing them: this is the control that can offer it.
 */
export function DiffImportMenu({
	open: controlledOpen,
	onOpenChange,
	embedded = false,
	boundaryRef,
	onBack,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	embedded?: boolean;
	boundaryRef?: RefObject<HTMLElement | null>;
	onBack?: () => void;
} = {}) {
	const [localOpen, setLocalOpen] = useState(false);
	const open = controlledOpen ?? localOpen;
	const changeOpen = useCallback(
		(next: boolean) => {
			if (controlledOpen === undefined) {
				setLocalOpen(next);
			}
			onOpenChange?.(next);
		},
		[controlledOpen, onOpenChange],
	);
	const [text, setText] = useState("");
	const [mode, setMode] = useState<ImportPlayMode>("whole");
	/** True while the paste waits on a confirm, because applying it would discard edits. */
	const [confirming, setConfirming] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const errorId = useId();
	const reduce = useReducedMotion() === true;

	const { loading, error, progress, run, reset } = useSourceImport();

	// The textarea doubles as a URL bar; the commit toggle only applies to PR URLs.
	const prRef = resolvePrUrl(text.trim());

	/**
	 * A pull request URL pasted into the URL importer arrives here instead of
	 * being refused: it opens the dialog with the URL already in place, so the
	 * only thing left to choose is whole-change or by-commit.
	 */
	const pending = useDiffImportStore((s) => s.pending);
	const takePending = useDiffImportStore((s) => s.take);
	useEffect(() => {
		if (pending === null) {
			return;
		}
		// An empty hand-off is a plain "open the dialog" (the empty scene list asks
		// for it): it must not wipe a paste the visitor left in the field.
		if (pending !== "") {
			setText(pending);
		}
		changeOpen(true);
		takePending();
	}, [changeOpen, pending, takePending]);

	useEffect(() => {
		if (!open) {
			// A closed popover forgets its pending question, not its paste.
			setConfirming(false);
			return;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				changeOpen(false);
			}
		}
		function onPointerDown(e: PointerEvent) {
			const root = boundaryRef?.current ?? rootRef.current;
			if (root && !e.composedPath().includes(root)) {
				changeOpen(false);
			}
		}
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointerDown);
		const focusId = requestAnimationFrame(() => textareaRef.current?.focus());
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
			cancelAnimationFrame(focusId);
		};
	}, [boundaryRef, changeOpen, open]);

	async function performImport() {
		// The toggle only reaches a PR: every other kind is a single sequence and
		// `run` ignores the mode for it.
		const imported = await run(text, mode);
		if (imported) {
			setText("");
			changeOpen(false);
		}
		// On failure the form comes back with the error under it.
		setConfirming(false);
	}

	function apply() {
		if (text.trim() === "" || loading) {
			return;
		}
		// Applying replaces the whole project: code edits, layers, media and audio
		// are asked about first, like opening a file.
		if (hasStudioWorkToLose()) {
			setConfirming(true);
			return;
		}
		void performImport();
	}

	function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
		// ⌘/Ctrl+Enter applies without reaching for the mouse.
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			apply();
		}
	}

	function hint() {
		if (loading && mode === "commit" && prRef) {
			return progress ? `fetching commit ${progress.done}/${progress.total}…` : "fetching commits…";
		}
		return "git diff | pbcopy · or github.com/…/pull/42";
	}

	return (
		<div className={embedded ? "contents" : "relative"} ref={rootRef}>
			{!embedded && (
				<motion.button
					type="button"
					onClick={() => changeOpen(!open)}
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-label="Import a git diff"
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className={`hit-ext flex size-9 items-center justify-center rounded-xl transition-colors ${
						open
							? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
							: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
					}`}
					title="Import a git diff"
				>
					<BranchDown size={13} aria-hidden="true" />
				</motion.button>
			)}

			<AnimatePresence>
				{open && (
					<motion.div
						{...sourcePopoverMotion(reduce)}
						// It grows from the control that opened it: the hub's left edge when
						// embedded, its own button's right edge when it stands alone.
						style={{ transformOrigin: embedded ? "top left" : "top right" }}
						// biome-ignore lint/a11y/useSemanticElements: a native <dialog> cannot be
						// anchored to its trigger the way this panel is, and loses its enter/exit
						// animation with it. Non-modal by intent: the backdrop dismisses and
						// nothing outside is inert, so no aria-modal is claimed.
						role="dialog"
						aria-label="Import a git diff"
						className={
							embedded
								? "sc-source-form-popover"
								: "absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
						}
					>
						{embedded && (
							<div className="sc-source-view-head">
								<button type="button" onClick={onBack} aria-label="Back to source choices">
									<ChevronLeft size={13} aria-hidden="true" />
								</button>
								<div>
									<strong>Import a change</strong>
									<span>Git diff or GitHub pull request</span>
								</div>
							</div>
						)}
						{confirming ? (
							<ConfirmDiscard
								message={importReplaceQuestion(classifySource(text.trim()))}
								confirmLabel={importConfirmLabel(classifySource(text.trim()))}
								onCancel={() => setConfirming(false)}
								onConfirm={() => void performImport()}
							/>
						) : (
							<>
								<textarea
									ref={textareaRef}
									value={text}
									onChange={(e) => {
										setText(e.target.value);
										if (error) {
											reset();
										}
									}}
									onKeyDown={onTextareaKeyDown}
									rows={10}
									spellCheck={false}
									placeholder="Paste a git diff, or a GitHub pull request link"
									aria-label="Git diff or GitHub pull request link"
									aria-invalid={error ? true : undefined}
									aria-describedby={error ? errorId : undefined}
									className="sc-source-field"
								/>
								<AnimatePresence initial={false}>
									{prRef && (
										// A PR link can play as one change or chapter by commit; quiet secondary row.
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
											className="overflow-hidden"
										>
											<div className="mt-2 flex items-center gap-2">
												<span className="sc-source-hint">play as</span>
												<ModeToggle mode={mode} onSelect={setMode} />
											</div>
										</motion.div>
									)}
								</AnimatePresence>
								<div className="mt-2 flex items-center justify-between gap-2">
									<span className="sc-source-hint">{hint()}</span>
									<StudioTooltip content="Apply (⌘ Enter)">
										<motion.button
											type="button"
											onClick={apply}
											disabled={text.trim() === "" || loading}
											aria-busy={loading || undefined}
											whileTap={{ scale: 0.97 }}
											transition={springs.snappy}
											className="sc-source-submit"
										>
											<BusyLabel busy={loading}>Apply</BusyLabel>
										</motion.button>
									</StudioTooltip>
								</div>
								{error && <SourceError id={errorId} message={error} />}
							</>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/** A two-option segmented control: whole change vs one chapter per commit. */
function ModeToggle({
	mode,
	onSelect,
}: { mode: ImportPlayMode; onSelect: (mode: ImportPlayMode) => void }) {
	return (
		<fieldset className="sc-source-modes" aria-label="Play as">
			{IMPORT_MODES.map((item) => {
				const isSelected = item.key === mode;
				return (
					<motion.button
						key={item.key}
						type="button"
						onClick={() => onSelect(item.key)}
						whileTap={{ scale: 0.97 }}
						transition={springs.snappy}
						aria-pressed={isSelected}
						className="sc-source-mode"
					>
						{isSelected && (
							<motion.span
								layoutId="diff-import-mode"
								className="sc-source-mode-plate"
								transition={springs.snappy}
							/>
						)}
						<span className="sc-source-mode-label">{item.label}</span>
					</motion.button>
				);
			})}
		</fieldset>
	);
}
