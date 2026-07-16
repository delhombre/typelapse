import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

/** Popover that turns a pasted unified diff into an animated step walkthrough. */
export function DiffImportMenu() {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const importDiff = useSnippetStore((s) => s.importDiff);

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

	function apply() {
		if (text.trim() === "") {
			return;
		}
		try {
			importDiff(text);
			setText("");
			setError(null);
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not parse the diff.");
		}
	}

	function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
		// ⌘/Ctrl+Enter applies without reaching for the mouse.
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			apply();
		}
	}

	return (
		<div className="relative">
			<motion.button
				type="button"
				onClick={() => setOpen((v) => !v)}
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
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
						{/* Backdrop — a click anywhere outside closes the popover. */}
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
							className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
						>
							<textarea
								ref={textareaRef}
								value={text}
								onChange={(e) => {
									setText(e.target.value);
									if (error) {
										setError(null);
									}
								}}
								onKeyDown={onTextareaKeyDown}
								rows={10}
								spellCheck={false}
								placeholder={"@@ -1,3 +1,3 @@\n-const old = 1;\n+const shiny = 2;"}
								className="block w-full resize-none rounded-lg border border-neutral-200/70 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-neutral-700 outline-none transition placeholder:text-neutral-300 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
							/>
							<div className="mt-2 flex items-center justify-between gap-2">
								<span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-600">
									git diff | pbcopy — paste here
								</span>
								<motion.button
									type="button"
									onClick={apply}
									disabled={text.trim() === ""}
									whileTap={{ scale: 0.96 }}
									transition={springs.snappy}
									className="flex h-8 items-center justify-center rounded-lg bg-neutral-900 px-3 text-[11px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
								>
									Apply
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
