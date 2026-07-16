import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

/** Past this many steps the dot row is dropped and the counter carries the position. */
const MAX_DOTS = 8;

/**
 * One floating pill — play/pause, an rAF-driven progress track, per-step dots and a
 * zero-padded counter — in the landing toolbar's language, themed for the studio's
 * light/dark modes. Hidden below two steps, where there is nothing to play.
 */
export function PlaybackControls() {
	const {
		snippet,
		isPlaying,
		isPreparing,
		currentStepIndex,
		playbackProgress,
		play,
		pause,
		setCurrentStepIndex,
	} = useSnippetStore();
	const totalSteps = snippet.steps.length;

	if (totalSteps < 2) {
		return null;
	}

	// Mirror live-preview's reelsProgress: follow the rAF clock while playing; paused,
	// fill to (currentStep + 1) / total so the bar reads its position instead of
	// looking stuck full anywhere but the true last step.
	const progress = isPlaying
		? playbackProgress
		: (Math.min(currentStepIndex, totalSteps - 1) + 1) / totalSteps;

	const transport = resolveTransport(isPreparing, isPlaying);
	const showDots = totalSteps <= MAX_DOTS;
	const counter = `${pad(currentStepIndex + 1)} / ${pad(totalSteps)}`;

	return (
		<div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-3 py-2 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.18)] dark:border-white/10 dark:bg-neutral-900">
			<motion.button
				type="button"
				onClick={isPlaying ? pause : play}
				disabled={isPreparing}
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-opacity disabled:opacity-70 dark:bg-white dark:text-neutral-900"
				title={transport.label}
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={transport.key}
						initial={{ opacity: 0, scale: 0.6 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.6 }}
						transition={springs.snappy}
					>
						{transport.icon}
					</motion.span>
				</AnimatePresence>
			</motion.button>

			{/* rAF-driven, so the fill tracks progress directly — no CSS transition. */}
			<div className="h-1 w-40 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
				<div
					className="h-full rounded-full bg-neutral-900 dark:bg-white"
					style={{ width: `${progress * 100}%` }}
				/>
			</div>

			{showDots && (
				<div className="flex items-center gap-1.5">
					{snippet.steps.map((step, index) => (
						<button
							key={step.id}
							type="button"
							aria-label={`Step ${index + 1}`}
							onClick={() => {
								// Seeking is a paused affordance; while playing the dots only track.
								if (!isPlaying) {
									setCurrentStepIndex(index);
								}
							}}
							className={`size-1.5 rounded-full transition-colors ${
								index === currentStepIndex
									? "bg-neutral-900 dark:bg-white"
									: "bg-black/20 dark:bg-white/20"
							}`}
						/>
					))}
				</div>
			)}

			<span className="font-mono text-[11px] text-neutral-400 tabular-nums">{counter}</span>
		</div>
	);
}

/** Zero-pad to two digits, e.g. 3 → "03". */
function pad(n: number): string {
	return String(n).padStart(2, "0");
}

interface Transport {
	key: string;
	label: string;
	icon: ReactNode;
}

/** The button's current face — spinner while preparing, then pause/play. */
function resolveTransport(isPreparing: boolean, isPlaying: boolean): Transport {
	if (isPreparing) {
		return { key: "preparing", label: "Preparing…", icon: <SpinnerIcon /> };
	}
	if (isPlaying) {
		return { key: "pause", label: "Pause", icon: <PauseIcon /> };
	}
	return { key: "play", label: "Play", icon: <PlayIcon /> };
}

function PlayIcon() {
	// A centred triangle reads left-heavy; nudge it 1px right to sit optically centred.
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="currentColor"
			role="img"
			style={{ marginLeft: 1 }}
		>
			<title>Play</title>
			<path d="M4 2v12l10-6z" />
		</svg>
	);
}

function PauseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" role="img">
			<title>Pause</title>
			<rect x="3" y="2" width="3.5" height="12" rx="0.75" />
			<rect x="9.5" y="2" width="3.5" height="12" rx="0.75" />
		</svg>
	);
}

function SpinnerIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin" role="img">
			<title>Preparing</title>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}
