import { classifySource } from "@/application/import/classify-source";
import { importConfirmLabel, importReplaceQuestion } from "@/application/import/import-wording";
import { STAGE_TOP_GAP, phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { usePhoneViewport } from "@/presentation/hooks/use-phone-viewport";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { type ImportIntent, takeImportIntent } from "@/presentation/utils/import-intent";
import { whenStudioCompositionReady } from "@/presentation/utils/studio-composition-ready";
import { hasStudioWorkToLose } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";

/**
 * A pasted snippet arrives as scene one. The landing button says "Import & animate"
 * and the studio opened on "0 scenes" with Play disabled; a paste made inside the
 * studio keeps its own, quieter behaviour because it does not pass this.
 */
const ARRIVAL = { openingScene: true } as const;

/**
 * Picks up what the landing hero was pasted, on arrival in the studio.
 *
 * The hero navigates the moment you press Render rather than fetching first,
 * because a landing page has nowhere honest to put a spinner: you asked to go
 * to the studio, so you go, and the work is shown happening where the result
 * will appear. That makes `/app#import=…` a real link too — it opens a pull
 * request in Typelapse from anywhere, including from a studio already open:
 * the hash changing on /app starts the same flow.
 *
 * An import replaces the project, so when the open one has work to lose (code
 * edits, layers, media, audio) it asks once before fetching anything. It asks
 * only after the open project's stored layers are on screen, or a project with
 * layers would look empty at the moment of the question.
 *
 * Renders nothing at all when the page was opened normally.
 */
export function ImportIntentBoot() {
	const [intent, setIntent] = useState<ImportIntent | null>(null);
	/** True while the intent waits on a confirm, because importing would discard work. */
	const [asking, setAsking] = useState(false);
	const { loading, error, progress, run, reset } = useSourceImport();
	const questionId = useId();

	const begin = useCallback(
		async (taken: ImportIntent) => {
			reset();
			setAsking(false);
			setIntent(taken);
			await whenStudioCompositionReady();
			if (hasStudioWorkToLose()) {
				setAsking(true);
				return;
			}
			void run(taken.source, taken.playMode, ARRIVAL);
		},
		[reset, run],
	);

	useEffect(() => {
		// takeImportIntent consumes: StrictMode's second mount finds nothing, so
		// the pull request is fetched once.
		const take = () => {
			const taken = takeImportIntent();
			if (taken) {
				void begin(taken);
			}
		};
		take();
		window.addEventListener("hashchange", take);
		return () => window.removeEventListener("hashchange", take);
	}, [begin]);

	if (!intent) {
		return null;
	}

	if (asking) {
		const kind = classifySource(intent.source.trim());
		return (
			// Rendered beside the shell, not in it: `studio-root sc-tokens` hands the strip the
			// studio's warm ramp and colour tokens, which the question's card reads. On a phone it
			// starts below the status bar like the rest of the chrome (DECISIONS D14).
			<div
				role="alertdialog"
				aria-labelledby={questionId}
				className="studio-root sc-tokens fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4"
			>
				<ConfirmDiscard
					messageId={questionId}
					message={importReplaceQuestion(kind)}
					confirmLabel={importConfirmLabel(kind)}
					onCancel={() => {
						setAsking(false);
						setIntent(null);
					}}
					onConfirm={() => {
						setAsking(false);
						void run(intent.source, intent.playMode, ARRIVAL);
					}}
					className="sc-confirm-float w-full max-w-sm"
				/>
			</div>
		);
	}

	const message = error ?? describe(intent, progress);
	// Success is its own announcement: the studio fills with the change. Only the
	// waiting and the failure need words.
	const show = loading || error !== null;

	return (
		<ImportStatus
			show={show}
			loading={loading}
			error={error !== null}
			message={message}
			onDismiss={() => {
				reset();
				setIntent(null);
			}}
		/>
	);
}

interface ImportStatusProps {
	show: boolean;
	loading: boolean;
	error: boolean;
	message: string;
	onDismiss: () => void;
}

/** The desktop header's height, and the line the code card and the notices start from. */
const DESKTOP_STATUS_TOP = 76;

/**
 * The status strip. It is a toast, so it covers no control on any shell
 * (verify-gate-findings D8, #202).
 *
 * From 1280px the header row, with the Preview/Edit switch centred in it, owns the
 * top 76px (the same line the code card and the notices start from): the status
 * sits below it. 1280px is DESKTOP_SCENE_MIN_WIDTH (scene-stage.ts) and 76px the
 * line shared with .sc-card-slot and notice-host.tsx; change them together.
 *
 * Under 1280px the shell is the phone's, at every width up to there, and its
 * corner row is the header: the status starts one stage gap under it, where the
 * frame starts, from the same figure (`rowBottom`) that places the sheet, so it
 * follows the status bar and the Dynamic Island. It wraps onto a second line
 * rather than ending in an ellipsis.
 */
function ImportStatus({ show, loading, error, message, onDismiss }: ImportStatusProps) {
	const desktop = useIsDesktop();
	const viewport = usePhoneViewport();
	const top = desktop ? DESKTOP_STATUS_TOP : phoneSheetGeometry(viewport).rowBottom + STAGE_TOP_GAP;

	return (
		<div
			className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
			style={{ top }}
			aria-live="polite"
		>
			<AnimatePresence>
				{show && (
					<motion.div
						data-testid="import-status"
						initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
						transition={springs.default}
						className={`pointer-events-auto flex max-w-[min(100%,30rem)] items-center gap-2.5 rounded-[22px] border py-2 pl-3.5 pr-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.28)] ${
							error
								? "border-red-200 bg-white text-red-600 dark:border-red-900/60 dark:bg-neutral-900 dark:text-red-400"
								: "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
						}`}
					>
						{loading && <Spinner />}
						<span
							data-testid="import-status-text"
							className="min-w-0 flex-1 text-pretty font-mono text-[11px] leading-[1.45] [overflow-wrap:anywhere]"
						>
							{message}
						</span>
						{error && (
							<button
								type="button"
								onClick={onDismiss}
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
