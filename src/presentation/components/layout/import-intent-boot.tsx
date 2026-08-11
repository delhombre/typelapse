import { classifySource } from "@/application/import/classify-source";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { type ImportIntent, takeImportIntent } from "@/presentation/utils/import-intent";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Picks up what the landing hero was pasted, on arrival in the studio.
 *
 * The hero navigates the moment you press Render rather than fetching first,
 * because a landing page has nowhere honest to put a spinner: you asked to go
 * to the studio, so you go, and the work is shown happening where the result
 * will appear. That makes `/app#import=…` a real link too — it opens a pull
 * request in Typelapse from anywhere.
 *
 * Renders nothing at all when the page was opened normally.
 */
export function ImportIntentBoot() {
	const [intent, setIntent] = useState<ImportIntent | null>(null);
	const { loading, error, progress, run, reset } = useSourceImport();

	useEffect(() => {
		// takeImportIntent consumes: StrictMode's second mount finds nothing, so
		// the pull request is fetched once.
		const taken = takeImportIntent();
		if (!taken) {
			return;
		}
		setIntent(taken);
		void run(taken.source, taken.playMode);
	}, [run]);

	if (!intent) {
		return null;
	}

	const message = error ?? describe(intent, progress);
	// Success is its own announcement: the studio fills with the change. Only the
	// waiting and the failure need words.
	const show = loading || error !== null;

	return (
		<div
			className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4"
			aria-live="polite"
		>
			<AnimatePresence>
				{show && (
					<motion.div
						initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
						transition={springs.default}
						className={`pointer-events-auto flex max-w-[min(92vw,30rem)] items-center gap-2.5 rounded-full border py-2 pl-3.5 pr-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.28)] ${
							error
								? "border-red-200 bg-white text-red-600 dark:border-red-900/60 dark:bg-neutral-900 dark:text-red-400"
								: "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
						}`}
					>
						{loading && <Spinner />}
						<span className="min-w-0 flex-1 truncate font-mono text-[11px]">{message}</span>
						{error && (
							<button
								type="button"
								onClick={() => {
									reset();
									setIntent(null);
								}}
								className="hit-ext shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
							>
								Dismiss
							</button>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/** What to say while it happens, in the terms the user pasted. */
function describe(intent: ImportIntent, progress: { done: number; total: number } | null): string {
	if (progress) {
		return `Reading commit ${progress.done} of ${progress.total}…`;
	}
	const kind = classifySource(intent.source);
	if (kind === "pr" || kind === "commit" || kind === "code-url") {
		return `Fetching ${trim(intent.source)}…`;
	}
	if (kind === "diff") {
		return "Reading the diff…";
	}
	return "Loading your code…";
}

/** URLs are shown, not hidden, but they do not get to push the pill wider. */
function trim(source: string): string {
	const bare = source.trim().replace(/^https?:\/\//, "");
	return bare.length > 52 ? `${bare.slice(0, 51)}…` : bare;
}

function Spinner() {
	return (
		<svg
			className="size-3.5 shrink-0 animate-spin"
			viewBox="0 0 24 24"
			fill="none"
			role="img"
			aria-hidden="true"
		>
			<title>Loading</title>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}
