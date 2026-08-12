import { routeUrlPaste } from "@/application/import/route-url-paste";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

/**
 * Popover that turns a URL into something the studio is showing.
 *
 * It decides neither what the URL *is* nor who should open it. `classifySource`
 * reads it, the same reader the landing hero and the diff dialog use, so the
 * three cannot disagree about a link; `routeUrlPaste` says which control
 * finishes it. What is left here is the popover.
 */
export function UrlImportMenu() {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	/** True while the fetch waits on a confirm, because opening it would discard edits. */
	const [confirming, setConfirming] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const { loading, error, run, reset } = useSourceImport();
	/** Said by this control rather than by an import: the paste is not a URL it can route. */
	const [refusal, setRefusal] = useState<string | null>(null);
	const message = refusal ?? error;
	const handOffToDiffImport = useDiffImportStore((s) => s.handOff);

	useEffect(() => {
		if (!open) {
			// A closed popover forgets its pending question, not its URL.
			setConfirming(false);
			return;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
			}
		}
		document.addEventListener("keydown", onKey);
		const focusId = requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			document.removeEventListener("keydown", onKey);
			cancelAnimationFrame(focusId);
		};
	}, [open]);

	async function performOpen(trimmed: string) {
		setConfirming(false);
		if (await run(trimmed)) {
			setUrl("");
			setOpen(false);
		}
	}

	async function fetchCode() {
		const trimmed = url.trim();
		if (!trimmed || loading) {
			return;
		}
		setRefusal(null);
		reset();

		switch (routeUrlPaste(trimmed)) {
			// The diff dialog gets the box already filled, so the only thing left
			// is the whole-change or by-commit choice it is there to offer. Not
			// destructive yet: that dialog asks its own confirm on Apply.
			case "hand-off":
				handOffToDiffImport(trimmed);
				setUrl("");
				setOpen(false);
				return;
			case "open-here":
				// Opening replaces the whole studio: edited work is asked about
				// first, before any fetch is spent on it.
				if (useSnippetStore.getState().hasUnsavedEdits()) {
					setConfirming(true);
					return;
				}
				await performOpen(trimmed);
				return;
			default:
				setRefusal("Unsupported URL: paste a gist, a GitHub file, a commit or a pull request link");
		}
	}

	function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			void fetchCode();
		}
	}

	return (
		<div className="relative">
			<motion.button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label="Import from URL"
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className={`hit-ext flex size-9 items-center justify-center rounded-xl transition-colors ${
					open
						? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
						: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
				}`}
				title="Import from URL"
			>
				<LinkIcon />
			</motion.button>

			<AnimatePresence>
				{open && (
					<>
						{/* Backdrop: a click anywhere outside closes the popover. */}
						<button
							type="button"
							aria-label="Close import from URL"
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
							aria-label="Import from URL"
							className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
						>
							{confirming ? (
								<ConfirmDiscard
									message="Replace what you have with the fetched file?"
									confirmLabel="Fetch it"
									onCancel={() => setConfirming(false)}
									onConfirm={() => void performOpen(url.trim())}
								/>
							) : (
								<>
									<div className="flex items-center gap-1.5">
										<input
											ref={inputRef}
											type="text"
											value={url}
											onChange={(e) => setUrl(e.target.value)}
											onKeyDown={onInputKeyDown}
											placeholder="gist or github url"
											spellCheck={false}
											className="h-8 flex-1 rounded-lg border border-neutral-200/70 bg-white px-2.5 font-mono text-[11px] text-neutral-700 outline-none transition placeholder:text-neutral-300 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
										/>
										<motion.button
											type="button"
											onClick={() => void fetchCode()}
											disabled={loading}
											whileTap={{ scale: 0.96 }}
											transition={springs.snappy}
											className="flex h-8 items-center justify-center gap-1 rounded-lg bg-neutral-900 px-3 text-[11px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
										>
											{loading ? <Spinner /> : "Fetch"}
										</motion.button>
									</div>
									{message && <p className="mt-1.5 px-0.5 text-[11px] text-red-500">{message}</p>}
								</>
							)}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
	);
}

function LinkIcon() {
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
			<title>Import from URL</title>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
