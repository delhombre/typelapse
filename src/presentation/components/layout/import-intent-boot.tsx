import { classifySource } from "@/application/import/classify-source";
import {
	importConfirmLabel,
	importNextStep,
	importReplaceQuestion,
} from "@/application/import/import-wording";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { SurfaceTop, useReportTransientSurface } from "@/presentation/hooks/use-phone-surface-top";
import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { springs } from "@/presentation/motion";
import { type ImportIntent, takeImportIntent } from "@/presentation/utils/import-intent";
import { whenStudioCompositionReady } from "@/presentation/utils/studio-composition-ready";
import { hasStudioWorkToLose } from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";
import { AlertCircle } from "reicon-react";

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
		return (
			<ReplaceQuestion
				kind={classifySource(intent.source.trim())}
				onCancel={() => {
					setAsking(false);
					setIntent(null);
				}}
				onConfirm={() => {
					setAsking(false);
					void run(intent.source, intent.playMode, ARRIVAL);
				}}
			/>
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
			nextStep={importNextStep(classifySource(intent.source.trim()))}
			onDismiss={() => {
				reset();
				setIntent(null);
			}}
		/>
	);
}

/**
 * The desktop header's height, and the line the code card, the notices, the status
 * and the replace question start from. The header row, with the Preview/Edit switch
 * centred in it, owns the top 76px from 1280px: nothing transient covers it.
 * 1280px is DESKTOP_SCENE_MIN_WIDTH (scene-stage.ts) and 76px the line shared with
 * .sc-card-slot and notice-host.tsx; change them together.
 */
const DESKTOP_TRANSIENT_TOP = 76;

interface ReplaceQuestionProps {
	kind: ReturnType<typeof classifySource>;
	onCancel: () => void;
	onConfirm: () => void;
}

/**
 * The question an import asks when it would replace work. Rendered beside the shell,
 * not in it: `studio-root sc-tokens` hands the strip the studio's warm ramp and colour
 * tokens, which the question's card reads. On a phone it starts where every transient
 * surface does, under the corner row and one stage gap from it (after-the-gate D6,
 * #207), so it follows the status bar and the Dynamic Island and covers no control;
 * from 1280px it starts at the header's line, under the Preview/Edit switch.
 */
function ReplaceQuestion({ kind, onCancel, onConfirm }: ReplaceQuestionProps) {
	const questionId = useId();
	const reportSurface = useReportTransientSurface();

	return (
		<SurfaceTop desktop={DESKTOP_TRANSIENT_TOP}>
			{(top) => (
				<div
					ref={reportSurface}
					role="alertdialog"
					aria-labelledby={questionId}
					className="studio-root sc-tokens fixed inset-x-0 z-[60] flex justify-center px-4"
					style={{ top }}
				>
					<ConfirmDiscard
						messageId={questionId}
						message={importReplaceQuestion(kind)}
						confirmLabel={importConfirmLabel(kind)}
						onCancel={onCancel}
						onConfirm={onConfirm}
						className="sc-confirm-float w-full max-w-sm"
					/>
				</div>
			)}
		</SurfaceTop>
	);
}

interface ImportStatusProps {
	show: boolean;
	loading: boolean;
	error: boolean;
	message: string;
	/** What to do after a failure, under the reason. */
	nextStep: string;
	onDismiss: () => void;
}

/**
 * The status strip. It is a toast, so it covers no control on any shell
 * (verify-gate-findings D8, #202).
 *
 * From 1280px it starts below the header row (DESKTOP_TRANSIENT_TOP). Under
 * 1280px the shell is the phone's, at every width up to there, and its corner row
 * is the header: the status starts one stage gap under it, where the frame starts
 * (`SurfaceTop`), so it follows the status bar and the Dynamic Island, and the
 * replace question and the notices start from the same line. It wraps onto more
 * lines rather than ending in an ellipsis.
 *
 * It is rendered beside the shell, so it carries `studio-root sc-tokens` to read the
 * studio's warm ramp and role tokens like the question does (design audit D9): the
 * opaque studio surface, its ring inside the shadow stack, the surface radius, the
 * UI face at the studio's scale. A failure is the danger ink with an icon and a next
 * step, never colour alone.
 */
function ImportStatus({ show, loading, error, message, nextStep, onDismiss }: ImportStatusProps) {
	const reportSurface = useReportTransientSurface();

	return (
		<SurfaceTop desktop={DESKTOP_TRANSIENT_TOP}>
			{(top) => (
				<div
					className="studio-root sc-tokens pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
					style={{ top }}
					aria-live="polite"
				>
					<AnimatePresence>
						{show && (
							<motion.div
								ref={reportSurface}
								data-testid="import-status"
								data-state={error ? "error" : "loading"}
								initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
								animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
								exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
								transition={springs.default}
								className="sc-import-status pointer-events-auto"
							>
								{loading && <Spinner />}
								{error && <AlertCircle size={16} strokeWidth={1.7} aria-hidden="true" />}
								<div className="sc-import-body">
									<span data-testid="import-status-text" className="sc-import-text">
										{message}
									</span>
									{error && <span className="sc-import-next">{nextStep}</span>}
								</div>
								{error && (
									<button type="button" onClick={onDismiss} className="sc-import-dismiss">
										Dismiss
									</button>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			)}
		</SurfaceTop>
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
			className="sc-import-spinner animate-spin"
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
