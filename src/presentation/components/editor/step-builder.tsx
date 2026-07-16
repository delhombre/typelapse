import { formatLineRanges, parseLineRanges } from "@/application/focus/line-ranges";
import type { Step } from "@/domain/entities/step";
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
			"group flex w-full flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-[transform,border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform";

		let stateClasses: string;
		if (isSelected) {
			stateClasses =
				"border-neutral-300 bg-neutral-100/80 dark:border-neutral-600/60 dark:bg-neutral-800/50";
		} else {
			stateClasses =
				"border-neutral-200/70 hover:-translate-y-px hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.15)] dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/30 dark:hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)]";
		}

		let dragClasses = "";
		if (isDragged) {
			dragClasses = "opacity-30";
		}
		if (isDropTarget) {
			dragClasses = "ring-2 ring-neutral-900/15 dark:ring-white/15";
		}

		return `${base} ${stateClasses} ${dragClasses}`;
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
					{steps.length} {steps.length === 1 ? "step" : "steps"}
				</span>
				<motion.button
					type="button"
					onClick={() => captureStep()}
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
				>
					<PlusIcon />
					Capture
				</motion.button>
			</div>

			{steps.length === 0 && (
				<p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
					Edit the code above, then Capture to add a step.
				</p>
			)}

			{/* -m-1 p-1: a 4px "bleed" so the hover-lift and drop ring aren't clipped by
			    the scroll container's overflow, at zero layout cost (cards stay aligned).
			    Cap + scroll only on desktop; in the mobile sheet the list flows into the
			    sheet's own scroll instead of nesting a second scroll region. */}
			<div className="-m-1 flex flex-col gap-1 p-1 lg:max-h-48 lg:overflow-y-auto">
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
						{/* Row 1: handle · number + preview · duration · remove */}
						<div className="flex w-full items-center gap-2">
							{/* Drag handle */}
							<span
								className="shrink-0 text-neutral-300 dark:text-neutral-600"
								title="Drag to reorder"
							>
								<svg
									width="8"
									height="12"
									viewBox="0 0 10 14"
									fill="currentColor"
									aria-hidden="true"
								>
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
								<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-medium tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
									{index + 1}
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
									className="w-14 rounded-lg border border-neutral-200/70 bg-white px-1.5 py-1 text-center font-mono text-[11px] tabular-nums text-neutral-600 outline-none transition focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-700"
									title="Duration (ms)"
								/>
								<span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-600">
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
						</div>

						{/* Row 2: spotlight lines + caption */}
						<div className="grid grid-cols-2 gap-1.5">
							<FocusInput step={step} />
							<CaptionInput step={step} />
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}

/**
 * Compact focus input on a step card — spotlight lines like "2-4, 7". Commits on
 * blur/Enter via `parseLineRanges`; an unparseable value tints the border red and
 * is not committed (quiet, no toast). Applied at render time, so edits are instant.
 */
function FocusInput({ step }: { step: Step }) {
	const updateStepFocus = useSnippetStore((s) => s.updateStepFocus);
	const [text, setText] = useState(() => formatLineRanges(step.highlightRanges));
	const [invalid, setInvalid] = useState(false);

	function commit() {
		const parsed = parseLineRanges(text);
		if (parsed === null) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		// Snap the field to the canonical form ("4-2,7" → "2-4, 7") — the card no
		// longer remounts on edit (step ids are stable), so sync explicitly.
		setText(formatLineRanges(parsed));
		updateStepFocus(step.id, parsed);
	}

	const borderClasses = invalid
		? "border-red-400/70 focus:border-red-400 dark:border-red-500/50 dark:focus:border-red-500"
		: "border-neutral-200/70 focus:border-neutral-300 dark:border-neutral-800 dark:focus:border-neutral-700";

	return (
		<input
			type="text"
			value={text}
			onChange={(e) => {
				setText(e.target.value);
				if (invalid) {
					setInvalid(false);
				}
			}}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.currentTarget.blur();
				}
			}}
			onClick={(e) => e.stopPropagation()}
			placeholder="focus 2-4,7"
			title="Spotlight these lines, dim the rest (e.g. 2-4, 7)"
			className={`w-full rounded-lg border bg-white px-1.5 py-1 font-mono text-[11px] text-neutral-600 outline-none transition placeholder:text-neutral-300 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-600 ${borderClasses}`}
		/>
	);
}

/**
 * Compact caption input on a step card — the line of prose shown beneath the
 * frame while this step holds. Commits on blur/Enter; any text is valid.
 */
function CaptionInput({ step }: { step: Step }) {
	const updateStepAnnotation = useSnippetStore((s) => s.updateStepAnnotation);
	const [text, setText] = useState(() => step.annotation ?? "");

	return (
		<input
			type="text"
			value={text}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => {
				// Mirror the store's trim so the field matches what actually renders.
				setText(text.trim());
				updateStepAnnotation(step.id, text);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.currentTarget.blur();
				}
			}}
			onClick={(e) => e.stopPropagation()}
			placeholder="caption…"
			title="Caption shown beneath the frame during this step"
			className="w-full rounded-lg border border-neutral-200/70 bg-white px-1.5 py-1 font-mono text-[11px] text-neutral-600 outline-none transition placeholder:text-neutral-300 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
		/>
	);
}

function PlusIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			role="img"
		>
			<title>Add</title>
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	);
}
