import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
	const reduce = useReducedMotion() === true;

	const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 };
	const settled = { opacity: 1, y: 0, scale: 1 };
	const leave = reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 };
	const transition = reduce ? { duration: 0 } : springs.snappy;

	return (
		<AnimatePresence mode="wait">
			{progress && (
				<motion.output
					key="progress"
					initial={enter}
					animate={settled}
					exit={leave}
					transition={transition}
					data-testid="export-status"
					className="si-status"
				>
					{/* The bar and the percentage are for eyes. A live region that
					    re-announced a number every few frames would be unusable, so the
					    screen reader is told the phase once and left alone. */}
					<span className="sr-only">{PHASE_LABELS[progress.phase]}</span>
					<div aria-hidden="true" className="si-status-track">
						<motion.div
							className="si-status-fill"
							// An indeterminate phase gets a third of a bar rather than a fake
							// number: the server streams nothing back and cannot be quoted.
							animate={{ width: `${(progress.ratio ?? 0.33) * 100}%` }}
							transition={reduce ? { duration: 0 } : springs.default}
						/>
					</div>
					<span aria-hidden="true" className="si-status-text">
						{progress.message}
					</span>
					<button type="button" onClick={cancelExport} className="si-button">
						<span className="si-seg-label">Cancel</span>
					</button>
				</motion.output>
			)}

			{!progress && outcome && (
				<motion.div
					key={outcome.kind}
					initial={enter}
					animate={settled}
					exit={leave}
					transition={transition}
					role={outcome.kind === "failed" ? "alert" : "status"}
					aria-live={outcome.kind === "failed" ? "assertive" : "polite"}
					data-testid="export-status"
					className="si-status"
					data-tone={outcome.kind === "failed" ? "failed" : undefined}
				>
					<span aria-hidden="true" className="si-status-mark">
						{outcome.kind === "done" ? <CheckIcon /> : "!"}
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
					<button
						type="button"
						onClick={dismissOutcome}
						aria-label="Dismiss export status"
						className="si-button"
					>
						<span aria-hidden="true">×</span>
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CheckIcon() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}
