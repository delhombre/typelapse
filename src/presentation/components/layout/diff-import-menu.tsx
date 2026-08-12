import { resolvePrUrl } from "@/application/import/pr-url";
import { type ImportPlayMode, useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

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
export function DiffImportMenu() {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [mode, setMode] = useState<ImportPlayMode>("whole");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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
		setText(pending);
		setOpen(true);
		takePending();
	}, [pending, takePending]);

	useEffect(() => {
		if (!open) {
			return;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
			}
		}
		document.addEventListener("keydown", onKey);
		const focusId = requestAnimationFrame(() => textareaRef.current?.focus());
		return () => {
			document.removeEventListener("keydown", onKey);
			cancelAnimationFrame(focusId);
		};
	}, [open]);

	async function apply() {
		if (text.trim() === "" || loading) {
			return;
		}
		// The toggle only reaches a PR: every other kind is a single sequence and
		// `run` ignores the mode for it.
		const imported = await run(text, mode);
		if (imported) {
			setText("");
			setOpen(false);
		}
	}

	function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
		// ⌘/Ctrl+Enter applies without reaching for the mouse.
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			void apply();
		}
	}

	function hint() {
		if (loading && mode === "commit" && prRef) {
			return progress ? `fetching commit ${progress.done}/${progress.total}…` : "fetching commits…";
		}
		return "git diff | pbcopy · or github.com/…/pull/42";
	}

	return (
		<div className="relative">
			<motion.button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label="Import a git diff"
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className={`hit-ext flex size-9 items-center justify-center rounded-xl transition-colors ${
					open
						? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
						: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
				}`}
				title="Import a git diff"
			>
				<DiffIcon />
			</motion.button>

			<AnimatePresence>
				{open && (
					<>
						{/* Backdrop: a click anywhere outside closes the popover. */}
						<button
							type="button"
							aria-label="Close diff import"
							className="fixed inset-0 z-40 cursor-default"
							onClick={() => setOpen(false)}
						/>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)" }}
							animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
							exit={{ opacity: 0, scale: 0.97, y: -4, filter: "blur(4px)" }}
							transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
							style={{ transformOrigin: "top right" }}
							// biome-ignore lint/a11y/useSemanticElements: a native <dialog> cannot be
							// anchored to its trigger the way this panel is, and loses its enter/exit
							// animation with it. Non-modal by intent: the backdrop dismisses and
							// nothing outside is inert, so no aria-modal is claimed.
							role="dialog"
							aria-label="Import a git diff"
							className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
						>
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
								placeholder={"paste a git diff, or a github pr url"}
								className="block w-full resize-none rounded-lg border border-neutral-200/70 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-neutral-700 outline-none transition placeholder:text-neutral-300 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
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
											<span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
												play as
											</span>
											<ModeToggle mode={mode} onSelect={setMode} />
										</div>
									</motion.div>
								)}
							</AnimatePresence>
							<div className="mt-2 flex items-center justify-between gap-2">
								<span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
									{hint()}
								</span>
								<motion.button
									type="button"
									onClick={() => void apply()}
									disabled={text.trim() === "" || loading}
									whileTap={{ scale: 0.96 }}
									transition={springs.snappy}
									className="flex h-8 items-center justify-center rounded-lg bg-neutral-900 px-3 text-[11px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
								>
									{loading ? <Spinner /> : "Apply"}
								</motion.button>
							</div>
							{error && <p className="mt-1.5 px-0.5 text-[11px] text-red-500">{error}</p>}
						</motion.div>
					</>
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
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{IMPORT_MODES.map((item) => {
				const isSelected = item.key === mode;
				return (
					<motion.button
						key={item.key}
						type="button"
						onClick={() => onSelect(item.key)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						className={`relative rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 ${
							isSelected
								? "text-white dark:text-neutral-900"
								: "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
						}`}
					>
						{isSelected && (
							<motion.span
								layoutId="diff-import-mode"
								className="absolute inset-0 rounded-md bg-neutral-900 dark:bg-neutral-100"
								transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
							/>
						)}
						<span className="relative z-10">{item.label}</span>
					</motion.button>
				);
			})}
		</div>
	);
}

function DiffIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Import a git diff</title>
			<line x1="6" y1="3" x2="6" y2="15" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="6" cy="18" r="3" />
			<path d="M18 9a9 9 0 0 1-9 9" />
		</svg>
	);
}

function Spinner() {
	return (
		<svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" role="img">
			<title>Loading</title>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}
