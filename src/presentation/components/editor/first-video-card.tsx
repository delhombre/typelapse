import {
	type FirstVideoStepId,
	firstVideoProgress,
	firstVideoShown,
	hasFocusOrCaption,
} from "@/application/onboarding/first-video";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useFirstVideoStore } from "@/presentation/stores/first-video.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import "./first-video-card.css";

/**
 * A dismissible card that walks a first-time visitor to a first video: capture a
 * scene, add a focus or a caption, render. It shows "n of 3" and only the next
 * step with one line; the steps tick from the project and from the export store
 * (`first-video.store`), never from a click on the card itself.
 *
 * It sits beside the empty scene's fork and adds no filled shape: "Later" is an
 * outlined control and the step line is a text link, only when the card can do
 * something about it (`onRefine` takes the visitor to the scene's fields; Capture
 * is the fork's, Render is the island's). Never shown on a project with three
 * scenes, hidden for good by "Later", gone from the load after its completion.
 */
export function FirstVideoCard({ onRefine }: { readonly onRefine?: () => void }) {
	const sceneCount = useSnippetStore((state) => state.snippet.steps.length);
	const refined = useSnippetStore((state) => hasFocusOrCaption(state.snippet.steps));
	const rendered = useFirstVideoStore((state) => state.preference.rendered);
	const dismissed = useFirstVideoStore((state) => state.preference.dismissed);
	const completedAtLoad = useFirstVideoStore((state) => state.completedAtLoad);
	const dismiss = useFirstVideoStore((state) => state.dismiss);
	const markCompleted = useFirstVideoStore((state) => state.markCompleted);
	const reduce = useReducedMotion() === true;
	const cardRef = useRef<HTMLFieldSetElement>(null);

	const progress = firstVideoProgress({ sceneCount, hasFocusOrCaption: refined, rendered });
	const shown = firstVideoShown({ sceneCount, dismissed, completed: completedAtLoad });

	// The completion is recorded the moment it is on screen; the card leaves on
	// the load after, so the line is read at least once.
	useEffect(() => {
		if (shown && progress.complete) {
			markCompleted();
		}
	}, [shown, progress.complete, markCompleted]);

	function putAway() {
		// The button unmounts under the focus it holds: the panel's first control takes it.
		const scope = cardRef.current?.closest(".sc-scenes");
		scope?.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
		feedback("selection");
		dismiss();
	}

	const next = progress.next;
	// Said to a screen reader when a step ticks: the card stays mounted between
	// ticks, so this region exists before it has anything new to say. The
	// completion sentence is the status line's alone.
	const announcement = `${progress.done} of ${progress.total} steps done${next ? `. Next: ${next.title}` : ""}`;

	return (
		// No entrance on a remount (Edit and Preview, the sheet coming back): only a
		// card that arrives while the studio is open, the first scene, moves in.
		<AnimatePresence initial={false}>
			{shown && (
				<motion.fieldset
					key="first-video"
					ref={cardRef}
					className="fv-card"
					initial={reduce ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					// Leaves faster and quieter than it came: a short ease-out, not the entrance's spring.
					exit={
						reduce
							? { opacity: 0 }
							: { opacity: 0, y: 4, transition: { duration: 0.15, ease: "easeOut" } }
					}
					transition={reduce ? { duration: 0 } : springs.snappy}
				>
					<legend className="sr-only">First video</legend>
					<p className="fv-head">
						<span aria-hidden="true">First video</span>
						<span className="fv-progress">
							<span className="fv-marks" aria-hidden="true">
								{progress.steps.map((step) => (
									<span key={step.id} className="fv-mark" data-done={step.done ? "" : undefined}>
										{step.done ? (
											<svg
												viewBox="0 0 10 10"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.5"
												aria-hidden="true"
											>
												<path d="m2 5.2 2.1 2.1L8 3" strokeLinecap="round" strokeLinejoin="round" />
											</svg>
										) : null}
									</span>
								))}
							</span>
							<span className="fv-count">
								{progress.done} of {progress.total}
								<span className="sr-only"> steps done</span>
							</span>
						</span>
					</p>
					{next ? (
						<>
							<div className="fv-step">
								<NextStep id={next.id} title={next.title} onRefine={onRefine} />
								<button
									type="button"
									className="fv-later"
									aria-label="Later: hide this card for good"
									onClick={putAway}
								>
									Later
								</button>
							</div>
							<p className="fv-line">{next.line}</p>
						</>
					) : (
						<div className="fv-step">
							<output className="fv-title">Your first video is made.</output>
							<button type="button" className="fv-later" onClick={putAway}>
								Done
							</button>
						</div>
					)}
					<span aria-live="polite" className="sr-only">
						{announcement}
					</span>
				</motion.fieldset>
			)}
		</AnimatePresence>
	);
}

/**
 * The next step's title. A text link only where pressing it does something the
 * card can reach: the scene's own focus and caption fields.
 */
function NextStep({
	id,
	title,
	onRefine,
}: {
	readonly id: FirstVideoStepId;
	readonly title: string;
	readonly onRefine?: () => void;
}) {
	if (id === "refine" && onRefine) {
		return (
			<button type="button" className="fv-link" onClick={onRefine}>
				{title}
			</button>
		);
	}
	return <p className="fv-title">{title}</p>;
}
