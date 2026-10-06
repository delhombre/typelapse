import { classifySource } from "@/application/import/classify-source";
import { importConfirmLabel, importReplaceQuestion } from "@/application/import/import-wording";
import { routeUrlPaste } from "@/application/import/route-url-paste";
import { BusyLabel } from "@/presentation/components/ui/busy-label";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { hasStudioWorkToLose } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion } from "motion/react";
import {
	type FormEvent,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { ChevronLeft, Link } from "reicon-react";

/**
 * Popover that turns a URL into something the studio is showing.
 *
 * It decides neither what the URL *is* nor who should open it. `classifySource`
 * reads it, the same reader the landing hero and the diff dialog use, so the
 * three cannot disagree about a link; `routeUrlPaste` says which control
 * finishes it. What is left here is the popover.
 */
export function UrlImportMenu({
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
	const [url, setUrl] = useState("");
	/** True while the fetch waits on a confirm, because opening it would discard edits. */
	const [confirming, setConfirming] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const errorId = useId();

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
		const focusId = requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
			cancelAnimationFrame(focusId);
		};
	}, [boundaryRef, changeOpen, open]);

	async function performOpen(trimmed: string) {
		setConfirming(false);
		if (await run(trimmed)) {
			setUrl("");
			changeOpen(false);
		}
	}

	async function fetchCode() {
		const trimmed = url.trim();
		if (loading) {
			return;
		}
		if (!trimmed) {
			// An empty press is answered, not ignored: silence reads as a dead button.
			setRefusal("Paste a gist or GitHub link first.");
			inputRef.current?.focus();
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
				changeOpen(false);
				return;
			case "open-here":
				// Opening replaces the whole project: work to lose is asked about
				// first, before any fetch is spent on it.
				if (hasStudioWorkToLose()) {
					setConfirming(true);
					return;
				}
				await performOpen(trimmed);
				return;
			default:
				setRefusal(
					"Unsupported URL: paste a gist, a GitHub file, a commit, a pull request or a release link",
				);
		}
	}

	function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		void fetchCode();
	}

	/** A refusal is about the link that was sent; editing it takes the refusal back. */
	function onUrlChange(next: string) {
		setUrl(next);
		if (message) {
			setRefusal(null);
			reset();
		}
	}

	return (
		<div className={embedded ? "contents" : "relative"} ref={rootRef}>
			{!embedded && (
				<motion.button
					type="button"
					onClick={() => changeOpen(!open)}
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
					<Link size={13} aria-hidden="true" />
				</motion.button>
			)}

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)" }}
						animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
						exit={{
							opacity: 0,
							scale: 0.98,
							y: -3,
							filter: "blur(2px)",
							transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
						}}
						transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
						// It grows from the control that opened it: the hub's left edge when
						// embedded, its own button's right edge when it stands alone.
						style={{ transformOrigin: embedded ? "top left" : "top right" }}
						// biome-ignore lint/a11y/useSemanticElements: a native <dialog> cannot be
						// anchored to its trigger the way this panel is, and loses its enter/exit
						// animation with it. Non-modal by intent: the backdrop dismisses and
						// nothing outside is inert, so no aria-modal is claimed.
						role="dialog"
						aria-label="Import from URL"
						className={`absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900 ${embedded ? "sc-source-form-popover" : ""}`}
					>
						{embedded && (
							<div className="sc-source-view-head">
								<button type="button" onClick={onBack} aria-label="Back to source choices">
									<ChevronLeft size={13} aria-hidden="true" />
								</button>
								<div>
									<strong>Paste a link</strong>
									<span>Gist, GitHub file, commit, pull request or release</span>
								</div>
							</div>
						)}
						{confirming ? (
							<ConfirmDiscard
								message={importReplaceQuestion(classifySource(url.trim()))}
								confirmLabel={importConfirmLabel(classifySource(url.trim()))}
								onCancel={() => setConfirming(false)}
								onConfirm={() => void performOpen(url.trim())}
							/>
						) : (
							<>
								<form className="flex items-center gap-1.5" onSubmit={onSubmit}>
									<input
										ref={inputRef}
										type="text"
										inputMode="url"
										value={url}
										onChange={(e) => onUrlChange(e.target.value)}
										placeholder="https://gist.github.com/…"
										aria-label="Gist or GitHub link"
										aria-invalid={message ? true : undefined}
										aria-describedby={message ? errorId : undefined}
										autoComplete="off"
										spellCheck={false}
										className="h-8 flex-1 rounded-xl border border-neutral-200/70 bg-white px-2.5 font-mono text-[11px] pointer-coarse:text-base text-neutral-700 outline-none transition-[border-color] duration-150 placeholder:text-neutral-400 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
									/>
									<motion.button
										type="submit"
										disabled={loading}
										whileTap={{ scale: 0.96 }}
										transition={springs.snappy}
										className="flex h-8 items-center justify-center gap-1 rounded-xl bg-[var(--color-primary)] px-3 text-[11px] font-semibold text-[var(--color-on-primary)] shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-colors duration-150 hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
									>
										<BusyLabel busy={loading}>Fetch</BusyLabel>
									</motion.button>
								</form>
								{message && (
									<p id={errorId} role="alert" className="sc-source-error">
										{message}
									</p>
								)}
							</>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
