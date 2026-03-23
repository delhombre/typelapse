import { STAGGER_DELAY, mountVariants, springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { truncateMiddle } from "@/presentation/utils/truncate-middle";
import { motion } from "motion/react";
import { useRef, useState } from "react";

function getStepPreview(code: string): string {
	const firstLine = code.split("\n")[0] ?? "";
	return truncateMiddle(firstLine.trim(), 30);
}

export function StepBuilder() {
	const {
		snippet,
		captureStep,
		removeStep,
		updateStepDuration,
		reorderSteps,
		currentStepIndex,
		setCurrentStepIndex,
	} = useSnippetStore();
	const steps = snippet.steps;

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
	const dragCounterRef = useRef(0);

	function handleDragStart(e: React.DragEvent, index: number) {
		setDraggedIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", String(index));
	}

	function handleDragEnd() {
		setDraggedIndex(null);
		setDropTargetIndex(null);
		dragCounterRef.current = 0;
	}

	function handleDragEnter(e: React.DragEvent, index: number) {
		e.preventDefault();
		dragCounterRef.current += 1;
		setDropTargetIndex(index);
	}

	function handleDragLeave() {
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setDropTargetIndex(null);
		}
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	}

	function handleDrop(e: React.DragEvent, targetIndex: number) {
		e.preventDefault();
		setDropTargetIndex(null);
		dragCounterRef.current = 0;

		if (draggedIndex === null || draggedIndex === targetIndex) {
			setDraggedIndex(null);
			return;
		}

		const ids = steps.map((s) => s.id);
		const removed = ids.splice(draggedIndex, 1);
		const movedId = removed[0];
		if (!movedId) {
			setDraggedIndex(null);
			return;
		}
		ids.splice(targetIndex, 0, movedId);
		reorderSteps(ids);
		setDraggedIndex(null);
	}

	function getItemClasses(index: number): string {
		const isSelected = index === currentStepIndex;
		const isDragged = index === draggedIndex;
		const isDropTarget = index === dropTargetIndex && index !== draggedIndex;

		const base =
			"group flex w-full items-center gap-2 border p-2 text-left transition-all duration-200";

		let stateClasses: string;
		if (isSelected) {
			stateClasses =
				"border-neutral-400/50 bg-neutral-100/80 dark:border-neutral-600/50 dark:bg-neutral-800/50";
		} else {
			stateClasses =
				"border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600/50";
		}

		let dragClasses = "";
		if (isDragged) {
			dragClasses = "opacity-30";
		}
		if (isDropTarget) {
			dragClasses =
				"ring-2 ring-neutral-400/50 ring-offset-1 dark:ring-neutral-500/50 dark:ring-offset-neutral-900";
		}

		return `${base} ${stateClasses} ${dragClasses}`;
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h3 className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
					Steps ({steps.length})
				</h3>
				<motion.button
					type="button"
					onClick={() => captureStep()}
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="h-7 border border-dashed border-neutral-300 px-3 font-mono text-[10px] uppercase tracking-wider text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
				>
					+ Capture
				</motion.button>
			</div>

			{steps.length === 0 && (
				<p className="font-mono text-[10px] text-neutral-400 dark:text-neutral-600">
					Edit code above, then click Capture to add a step.
				</p>
			)}

			<div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
				{steps.map((step, index) => (
					<motion.div
						key={step.id}
						variants={mountVariants}
						initial="hidden"
						animate="visible"
						transition={{ ...springs.gentle, delay: index * STAGGER_DELAY }}
						draggable
						onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, index)}
						onDragEnd={handleDragEnd}
						onDragEnter={(e) => handleDragEnter(e as unknown as React.DragEvent, index)}
						onDragLeave={handleDragLeave}
						onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent)}
						onDrop={(e) => handleDrop(e as unknown as React.DragEvent, index)}
						className={getItemClasses(index)}
						style={{ cursor: "grab" }}
					>
						{/* Drag handle */}
						<span
							className="shrink-0 text-neutral-300 dark:text-neutral-600"
							title="Drag to reorder"
						>
							<svg width="8" height="12" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
								<circle cx="2.5" cy="2" r="1.2" />
								<circle cx="7.5" cy="2" r="1.2" />
								<circle cx="2.5" cy="7" r="1.2" />
								<circle cx="7.5" cy="7" r="1.2" />
								<circle cx="2.5" cy="12" r="1.2" />
								<circle cx="7.5" cy="12" r="1.2" />
							</svg>
						</span>

						{/* Step number + preview */}
						<button
							type="button"
							onClick={() => setCurrentStepIndex(index)}
							className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
						>
							<span className="shrink-0 font-mono text-[10px] text-neutral-400 dark:text-neutral-600">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span className="truncate font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
								{getStepPreview(step.code)}
							</span>
						</button>

						{/* Duration input */}
						<div className="flex shrink-0 items-center gap-1">
							<input
								type="number"
								value={step.duration}
								onChange={(e) => {
									const val = Number.parseInt(e.target.value, 10);
									if (val > 0) {
										updateStepDuration(step.id, val);
									}
								}}
								onClick={(e) => e.stopPropagation()}
								className="w-12 border border-neutral-200 bg-neutral-50 px-1 py-0.5 text-center font-mono text-[10px] text-neutral-500 outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50 dark:focus:border-neutral-500"
								title="Duration (ms)"
							/>
							<span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-600">
								ms
							</span>
						</div>

						{/* Remove button */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								removeStep(step.id);
							}}
							className="shrink-0 text-neutral-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 dark:text-neutral-700"
							title="Remove step"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								role="img"
							>
								<title>Remove</title>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</motion.div>
				))}
			</div>
		</div>
	);
}
