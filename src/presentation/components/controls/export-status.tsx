import { LiveRegion } from "@/presentation/components/ui/live-region";
import { springs } from "@/presentation/motion";
import { type ExportOutcome, useExportStore } from "@/presentation/stores/export.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, X } from "reicon-react";
import { useCloudStatusView } from "./cloud-render";

/**
 * What the export is doing, and what it did.
 *
 * The old bar had no success state at all: a finished render simply stopped
 * spinning, and the only evidence was the browser's download shelf — which on a
 * phone is not on screen. So this outlives the render, says which machine made
 * the file and how big it turned out, and waits to be dismissed. Failures do
 * the same in the assertive register, because a failure nobody reads is a
 * failure that gets retried identically.
 *
 * It floats just above the island on every layout now. The bar that used to
 * hold it is gone, and a render that finishes while a cluster sheet is open —
 * or while the phone's sheet is collapsed — still has to say so.
 */

/** What a screen reader is told once per phase, instead of once per frame. */
const PHASE_LABELS: Record<"preparing" | "rendering" | "downloading", string> = {
	preparing: "Preparing the export.",
	rendering: "Rendering.",
	downloading: "Writing the file.",
};

export function ExportStatus() {
	const progress = useExportStore((s) => s.progress);
	const outcome = useExportStore((s) => s.outcome);
	const dismissOutcome = useExportStore((s) => s.dismissOutcome);
	const cancelExport = useExportStore((s) => s.cancelExport);
	const setTarget = useExportStore((s) => s.setTarget);
	const exportVideo = useExportStore((s) => s.exportVideo);
	// A cloud render outlives the page; this device's export, when there is one, speaks first.
	const cloud = useCloudStatusView();
	const reduce = useReducedMotion() === true;

	const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 };
	const settled = { opacity: 1, y: 0, scale: 1 };
	// A departure is quicker than an arrival and accelerates away; with
	// mode="wait" the next status waits on it, so a slow exit is a slow answer.
	const leave = reduce
		? { opacity: 0, transition: { duration: 0 } }
		: { opacity: 0, y: 4, scale: 0.99, transition: { duration: 0.12, ease: EASE_IN } };
	const transition = reduce ? { duration: 0 } : springs.snappy;

	// The visible rows come and go with their words, so they speak through two
	// regions that stay mounted instead, in the same order of precedence.
	const failure = !progress
		? outcome?.kind === "failed"
			? outcome.message
			: !outcome && cloud?.kind === "problem"
				? cloud.text
				: ""
		: "";
	const news = progress
		? PHASE_LABELS[progress.phase]
		: outcome?.kind === "done"
			? savedSentence(outcome)
			: !outcome && cloud && cloud.kind !== "problem"
				? cloud.text
				: "";

	return (
		<>
			<LiveRegion message={news} />
			<LiveRegion message={failure} urgent />
			<AnimatePresence mode="wait">
				{progress && (
					<motion.div
						key="progress"
						initial={enter}
						animate={settled}
						exit={leave}
						transition={transition}
						data-testid="export-status"
						className="si-status"
						data-island-companion=""
					>
						{/* The bar and the percentage are for eyes. A live region that
						    re-announced a number every few frames would be unusable, so the
						    screen reader is told the phase once and left alone. */}
						<div aria-hidden="true" className="si-status-track">
							<ProgressFill ratio={progress.ratio} />
						</div>
						<span aria-hidden="true" className="si-status-text">
							{progress.message}
						</span>
						{/* Waiting is the next step, not cancelling: Cancel stays dim. */}
						<button type="button" onClick={cancelExport} className="si-button">
							<span className="si-seg-label">Cancel</span>
						</button>
					</motion.div>
				)}

				{!progress && outcome && (
					<motion.div
						key={outcome.kind}
						initial={enter}
						animate={settled}
						exit={leave}
						transition={transition}
						data-testid="export-status"
						className="si-status"
						data-island-companion=""
						data-tone={outcome.kind === "failed" ? "failed" : undefined}
					>
						<span aria-hidden="true" className="si-status-mark">
							{outcome.kind === "done" ? <CheckIcon /> : <AlertIcon />}
						</span>
						<span className="si-status-text si-status-message">
							{outcome.kind === "done" ? (
								<>
									Saved <strong>{outcome.filename}</strong> · {formatBytes(outcome.bytes)} ·{" "}
									{(outcome.elapsedMs / 1000).toFixed(1)}s{" "}
									{outcome.target === "device" ? "on this device" : "on the server"}
									{outcome.note ? ` · ${outcome.note}` : ""}
								</>
							) : (
								outcome.message
							)}
						</span>
						{outcome.kind === "failed" && outcome.alternative === "device" && (
							<button
								type="button"
								onClick={() => {
									setTarget("device");
									void exportVideo();
								}}
								className="si-button si-status-action"
							>
								<span className="si-seg-label">Render on this device</span>
							</button>
						)}
						<button
							type="button"
							onClick={dismissOutcome}
							aria-label="Dismiss export status"
							className="si-button si-status-dismiss"
						>
							<DismissIcon />
						</button>
					</motion.div>
				)}

				{!progress && !outcome && cloud && (
					<motion.div
						key={cloud.key}
						initial={enter}
						animate={settled}
						exit={leave}
						transition={transition}
						data-testid="cloud-render-status"
						className="si-status"
						data-island-companion=""
						data-tone={cloud.kind === "problem" ? "failed" : undefined}
					>
						{cloud.kind === "progress" ? (
							// The server reports a phase, never a fraction, so the bar says it is
							// working without quoting a number nobody measured.
							<div aria-hidden="true" className="si-status-track">
								<ProgressFill ratio={null} />
							</div>
						) : cloud.kind === "note" ? null : (
							<span aria-hidden="true" className="si-status-mark">
								{cloud.kind === "done" ? <CheckIcon /> : <AlertIcon />}
							</span>
						)}
						<span
							className="si-status-text si-status-message"
							data-note={cloud.kind === "note" ? "" : undefined}
						>
							{cloud.text}
						</span>
						{cloud.action && (
							<button
								type="button"
								onClick={cloud.action.run}
								className="si-button si-status-action"
							>
								<span className="si-seg-label">{cloud.action.label}</span>
							</button>
						)}
						{cloud.extra?.map((extra) => (
							<button key={extra.label} type="button" onClick={extra.run} className="si-button">
								<span className="si-seg-label">{extra.label}</span>
							</button>
						))}
						{cloud.dismiss && (
							<button
								type="button"
								onClick={cloud.dismiss}
								aria-label="Dismiss cloud render status"
								className="si-button si-status-dismiss"
							>
								<DismissIcon />
							</button>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

function savedSentence(outcome: Extract<ExportOutcome, { kind: "done" }>): string {
	const where = outcome.target === "device" ? "on this device" : "on the server";
	const note = outcome.note ? ` ${outcome.note}.` : "";
	return `Saved ${outcome.filename}, ${formatBytes(outcome.bytes)}, in ${(outcome.elapsedMs / 1000).toFixed(1)}s ${where}.${note}`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The bar's fill. A measured ratio is a transform the compositor scales, eased
 * over one short tween per update, so the bar never trails the percentage
 * beside it or overshoots it the way a width spring did. A phase with no
 * number is drawn as a travelling segment (CSS), not as a third of a bar.
 */
function ProgressFill({ ratio }: { ratio: number | null }) {
	// Two keys, two nodes: tweening from the travelling translate into a scale
	// would interpolate one matrix into the other and smear the bar for 160ms.
	if (ratio === null) {
		return <div key="travel" className="si-status-fill" data-indeterminate="" />;
	}
	const clamped = Math.min(Math.max(ratio, 0), 1);
	return (
		<div key="measured" className="si-status-fill" style={{ transform: `scaleX(${clamped})` }} />
	);
}

/** Departures accelerate away (the system's exit curve). */
const EASE_IN = [0.4, 0, 1, 1] as const;

function CheckIcon() {
	return <Check size={13} strokeWidth={2} aria-hidden="true" />;
}

function AlertIcon() {
	return <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />;
}

function DismissIcon() {
	return <X size={13} strokeWidth={2} aria-hidden="true" />;
}
