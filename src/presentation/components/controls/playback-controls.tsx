import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { AnimatePresence, motion } from "motion/react";

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
	const isDark = useThemeModeStore((s) => s.mode === "dark");
	const totalSteps = snippet.steps.length;

	if (totalSteps === 0) {
		return null;
	}

	const progress = isPlaying ? playbackProgress : currentStepIndex / Math.max(totalSteps - 1, 1);

	return (
		<div className="flex items-center gap-4">
			{/* Play/Pause button */}
			<motion.button
				type="button"
				onClick={isPlaying || isPreparing ? pause : play}
				disabled={totalSteps < 2}
				whileTap={{ scale: 0.96 }}
				whileHover={{ scale: 1.05 }}
				transition={springs.snappy}
				className={`flex size-9 items-center justify-center rounded-full disabled:opacity-40 ${
					isPreparing
						? "animate-pulse bg-neutral-700 text-neutral-300 dark:bg-neutral-300 dark:text-neutral-700"
						: "bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
				}`}
				title={isPreparing ? "Preparing..." : isPlaying ? "Pause" : "Play"}
			>
				<AnimatePresence mode="wait" initial={false}>
					{isPreparing ? (
						<motion.span
							key="preparing"
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.6 }}
							transition={springs.snappy}
						>
							<LoadingIcon />
						</motion.span>
					) : isPlaying ? (
						<motion.span
							key="pause"
							initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
							animate={{ opacity: 1, scale: 1, rotate: 0 }}
							exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
							transition={springs.snappy}
						>
							<PauseIcon />
						</motion.span>
					) : (
						<motion.span
							key="play"
							initial={{ opacity: 0, scale: 0.6, rotate: 90 }}
							animate={{ opacity: 1, scale: 1, rotate: 0 }}
							exit={{ opacity: 0, scale: 0.6, rotate: -90 }}
							transition={springs.snappy}
						>
							<PlayIcon />
						</motion.span>
					)}
				</AnimatePresence>
			</motion.button>

			{/* Progress bar + step dots */}
			<div className="flex flex-col items-center gap-2">
				{/* Progress bar */}
				<div className="h-1.5 w-36 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
					<motion.div
						className={`h-full rounded-full ${
							isPlaying
								? "bg-linear-to-r from-neutral-700 to-neutral-900 progress-bar-active dark:from-neutral-300 dark:to-neutral-100"
								: "bg-neutral-900 dark:bg-neutral-100"
						}`}
						animate={{ width: `${progress * 100}%` }}
						transition={springs.default}
					/>
				</div>

				{/* Step dots */}
				<div className="flex items-center gap-1.5">
					{snippet.steps.map((step, index) => {
						const isActive = index === currentStepIndex;
						return (
							<motion.button
								key={step.id}
								type="button"
								onClick={() => {
									pause();
									setCurrentStepIndex(index);
								}}
								animate={{
									scale: isActive ? 1.6 : 1,
									backgroundColor: isActive
										? isDark
											? "rgb(245 245 245)"
											: "rgb(23 23 23)"
										: isDark
											? "rgb(64 64 64)"
											: "rgb(212 212 212)",
								}}
								whileHover={{ scale: isActive ? 1.6 : 1.3 }}
								transition={springs.snappy}
								className="size-1.5 rounded-full"
								title={`Step ${index + 1}`}
							/>
						);
					})}
				</div>
			</div>

			{/* Counter */}
			<span className="font-mono text-[10px] tabular-nums text-neutral-500">
				{isPreparing
					? "..."
					: `${String(currentStepIndex + 1).padStart(2, "0")} / ${String(totalSteps).padStart(2, "0")}`}
			</span>
		</div>
	);
}

function PlayIcon() {
	// Nudge the triangle right ~1px — a centered play triangle reads left-heavy.
	return (
		<svg
			width="16"
			height="16"
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
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" role="img">
			<title>Pause</title>
			<rect x="3" y="2" width="3.5" height="12" rx="0.75" />
			<rect x="9.5" y="2" width="3.5" height="12" rx="0.75" />
		</svg>
	);
}

function LoadingIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Preparing</title>
			<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
		</svg>
	);
}
