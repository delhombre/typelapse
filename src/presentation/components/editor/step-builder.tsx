import {
	firstLinePastEnd,
	formatLineRanges,
	parseLineRanges,
} from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import { MAX_ANNOTATION_LENGTH, type Step } from "@/domain/entities/step";
import { LiveRegion } from "@/presentation/components/ui/live-region";
import {
	SceneDeletionUndo,
	sceneDeletedMessage,
} from "@/presentation/components/ui/scene-deletion-undo";
import { SceneDurationInput } from "@/presentation/components/ui/scene-duration-input";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { useSceneDeletion } from "@/presentation/hooks/use-scene-deletion";
import { STAGGER_DELAY, mountVariants, springs } from "@/presentation/motion";
import { hasEmptyDraft, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { truncateMiddle } from "@/presentation/utils/truncate-middle";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Add } from "reicon-react";
import { StudioLayerStrip } from "./studio-layer-strip";

function getStepPreview(code: string): string {
	const firstLine = code.split("\n")[0] ?? "";
	return truncateMiddle(firstLine.trim(), 30);
}

export function StepBuilder() {
	// Field by field: the whole store changes on every playback tick.
	const snippet = useSnippetStore((s) => s.snippet);
	const captureStep = useSnippetStore((s) => s.captureStep);
	const emptyDraft = useSnippetStore(hasEmptyDraft);
	const addBlankScene = useSnippetStore((s) => s.addBlankScene);
	const updateStepDuration = useSnippetStore((s) => s.updateStepDuration);
	const reorderSteps = useSnippetStore((s) => s.reorderSteps);
	const currentStepIndex = useSnippetStore((s) => s.currentStepIndex);
	const setCurrentStepIndex = useSnippetStore((s) => s.setCurrentStepIndex);
	const steps = snippet.steps;
	const { pendingDeletion, deleteScene, undoDeletion } = useSceneDeletion();

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
	const dragCounterRef = useRef(0);
	const listRef = useRef<HTMLDivElement>(null);
	const selectedStepId = steps[currentStepIndex]?.id;

	// Selection can arrive from the film timeline, well outside this scroller.
	// Reveal that card once; do not bind the two scroll positions continuously,
	// because a visitor must still be free to browse another part of the list.
	useEffect(() => {
		if (!selectedStepId) {
			return;
		}
		listRef.current?.querySelector<HTMLElement>("[data-step-selected]")?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		});
	}, [selectedStepId]);

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
		if (selectedStepId) {
			setCurrentStepIndex(Math.max(0, ids.indexOf(selectedStepId)));
		}
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
				<span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
					{steps.length} {steps.length === 1 ? "scene" : "scenes"}
				</span>
				<div className="flex items-center gap-2">
					<RecordButton />
					<BlankSceneButton onAdd={addBlankScene} />
					<CaptureButton onCapture={captureStep} disabled={emptyDraft} />
				</div>
			</div>

			<LiveRegion message={sceneDeletedMessage(pendingDeletion?.sceneNumber)} />
			<AnimatePresence initial={false}>
				{pendingDeletion && (
					<SceneDeletionUndo
						compact
						sceneNumber={pendingDeletion.sceneNumber}
						onUndo={() => {
							if (undoDeletion()) {
								feedback("commit");
							}
						}}
					/>
				)}
			</AnimatePresence>

			{steps.length === 0 && (
				<p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
					Edit the code above, then Capture to add your first scene.
				</p>
			)}

			{/* -m-1 p-1: a 4px "bleed" so the hover-lift and drop ring aren't clipped by
			    the scroll container's overflow, at zero layout cost (cards stay aligned).
			    No cap and no scroll of its own: the list used to carry a 192px max-height
			    inside the card's own 228px scroller, which is two scroll regions stacked
			    one inside the other — the wheel drove the inner one to its end and then
			    stopped, 40px short of the last step, with the outer scrollbar still
			    showing room. The card owns the scroll now, on both layouts. */}
			<div ref={listRef} className="-m-1 flex flex-col gap-1 p-1">
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
						data-step-selected={index === currentStepIndex ? "" : undefined}
						// The hand closes on the card it has picked up. A grab cursor that
						// never becomes a grabbing one says the row can be dragged and then
						// says nothing at all about the drag in progress.
						style={{ cursor: draggedIndex === index ? "grabbing" : "grab" }}
					>
						{/* Row 1: handle · number + preview · duration · remove */}
						<div className="flex w-full items-center gap-2">
							{/* Drag handle */}
							<StudioTooltip content="Drag to reorder">
								<span className="shrink-0 text-neutral-300 dark:text-neutral-600">
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
							</StudioTooltip>

							{/* Step number + preview */}
							<button
								type="button"
								onClick={() => setCurrentStepIndex(index)}
								className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pointer-coarse:min-h-11"
							>
								<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-medium tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
									{index + 1}
								</span>
								{step.hasCode ? (
									<span className="truncate font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
										{getStepPreview(step.code)}
									</span>
								) : (
									<span className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
										No code
									</span>
								)}
							</button>

							{/* Duration input */}
							<div className="flex shrink-0 items-center gap-1">
								<StudioTooltip content="Duration in seconds">
									<SceneDurationInput
										durationMs={step.duration}
										onCommit={(durationMs) => updateStepDuration(step.id, durationMs)}
										aria-label={`Scene ${index + 1} duration in seconds`}
										onClick={(e) => e.stopPropagation()}
										// 16px under a finger: iOS zooms the page into any smaller field.
										className="w-12 rounded-lg border border-neutral-200/70 bg-white px-1.5 py-1 text-center font-mono text-[11px] tabular-nums pointer-coarse:h-11 pointer-coarse:w-14 pointer-coarse:text-base text-neutral-600 transition-[border-color,background-color] duration-150 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-700"
									/>
								</StudioTooltip>
								<span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
									s
								</span>
							</div>

							{/* Remove button. Its target is bounded to the room the card actually
							    has rather than grown to the shared 44px square: that square reached
							    3px past the row and covered the top edge of the caption field below
							    it, so a press aimed at the caption deleted the step instead. The
							    visible mark stays 24px — the floor this density is allowed — and the
							    pseudo-element claims only the gaps that border it. Under a finger
							    the duration field makes the row 44px tall, so the extent grows to
							    the row's height and still stops at its edge. */}
							<StudioTooltip content={`Delete scene ${index + 1}`}>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										deleteScene(step, index);
										feedback("commit");
									}}
									className="relative flex size-6 shrink-0 items-center justify-center text-neutral-300 opacity-0 transition-opacity before:absolute before:-inset-x-[10px] before:-inset-y-[3px] pointer-coarse:before:-inset-y-[10px] hover:text-neutral-900 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100 dark:text-neutral-700 dark:hover:text-neutral-100"
									aria-label={`Delete scene ${index + 1}`}
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
							</StudioTooltip>
						</div>

						{/* Row 2: spotlight lines + caption. A blank scene has no code to
						    spotlight, so its caption takes the whole row. */}
						<div className="grid grid-cols-2 gap-1.5">
							{step.hasCode ? <FocusInput step={step} index={index} /> : null}
							<div className={step.hasCode ? "min-w-0" : "col-span-2 min-w-0"}>
								<CaptionInput step={step} index={index} />
							</div>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}

/**
 * Desktop's code-side inspector. Scene order, duration, duplication and deletion
 * belong to the timeline directly below the stage; repeating them here created
 * two competing editors for the same thing. This surface only keeps metadata
 * that is naturally authored beside code: focus lines and the spoken caption.
 *
 * Mobile still uses {@link StepBuilder}: it has no film timeline, so removing
 * the list there would remove the only way to navigate and order scenes.
 */
export function SceneInspector() {
	const steps = useSnippetStore((state) => state.snippet.steps);
	const currentStepIndex = useSnippetStore((state) => state.currentStepIndex);
	const captureStep = useSnippetStore((state) => state.captureStep);
	const emptyDraft = useSnippetStore(hasEmptyDraft);
	const addBlankScene = useSnippetStore((state) => state.addBlankScene);
	const composition = useStudioCompositionStore();
	const selectedAudioCueId = useStudioCompositionSelectionStore(
		(state) => state.selectedAudioCueId,
	);
	const step = steps[currentStepIndex];
	const selectedScene = composition.value.project.scenes.find(
		(scene) => scene.id === composition.selectedSceneId,
	);
	const selectedBlock = selectedScene?.blocks.find(
		(block) => block.id === composition.selectedBlockId,
	);
	const isLayerSelected =
		selectedAudioCueId !== null || (selectedBlock !== undefined && selectedBlock.kind !== "code");

	return (
		<div className="flex flex-col gap-3">
			<div className="grid gap-1.5">
				{/* The three add controls outgrow a narrow island: they wrap under the
				    label rather than breaking "Scene 1 of 3" over two lines. */}
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
					<p className="whitespace-nowrap text-xs font-semibold tracking-[-0.01em] text-neutral-800 dark:text-neutral-100">
						{step ? `Scene ${currentStepIndex + 1} of ${steps.length}` : "No scene yet"}
					</p>
					{/* While a layer is open the section's job is navigation, and the
					    layer's fields need the room more than a second way to add a scene. */}
					{isLayerSelected ? null : (
						<div className="flex shrink-0 items-center gap-2">
							<RecordButton />
							<BlankSceneButton onAdd={addBlankScene} />
							<CaptureButton onCapture={captureStep} disabled={emptyDraft} />
						</div>
					)}
				</div>
				<p className="text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
					{isLayerSelected
						? "Layer controls for this scene."
						: step?.hasCode
							? "Focus and caption for the selected scene."
							: step
								? "Caption for this scene without code."
								: "Capture a scene to animate this code."}
				</p>
			</div>

			<StudioLayerStrip />

			{step && !isLayerSelected && (
				// No entrance: this swaps on every scene selection, keyboard ones included.
				<div key={step.id} className="grid grid-cols-2 gap-2">
					{step.hasCode ? (
						<label htmlFor={`scene-${step.id}-focus`} className="grid min-w-0 gap-1.5">
							<span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
								Focus lines
							</span>
							<FocusInput
								id={`scene-${step.id}-focus`}
								step={step}
								index={currentStepIndex}
								placeholder="2-4, 7"
							/>
						</label>
					) : null}
					<label
						htmlFor={`scene-${step.id}-caption`}
						className={`grid min-w-0 gap-1.5 ${step.hasCode ? "" : "col-span-2"}`}
					>
						<span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
							Caption
						</span>
						<CaptionInput
							id={`scene-${step.id}-caption`}
							step={step}
							index={currentStepIndex}
							placeholder="Shown under the frame"
						/>
					</label>
				</div>
			)}
		</div>
	);
}

/**
 * Adds a scene without code: a title card, an outro, a pause over media. A
 * ghost beside Capture rather than a third dashed button, so Capture stays the
 * row's main way to add a scene.
 */
function BlankSceneButton({ onAdd }: { onAdd: () => void }) {
	return (
		<StudioTooltip content="Add a scene without code">
			<motion.button
				type="button"
				onClick={() => {
					onAdd();
					feedback("commit");
				}}
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				className="flex h-8 items-center pointer-coarse:h-11 rounded-xl px-2.5 text-xs font-medium text-neutral-500 transition-[background-color,color] duration-150 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			>
				Blank
			</motion.button>
		</StudioTooltip>
	);
}

function CaptureButton({ onCapture, disabled }: { onCapture: () => void; disabled: boolean }) {
	return (
		<motion.button
			type="button"
			disabled={disabled}
			onClick={() => {
				onCapture();
				feedback("commit");
			}}
			whileTap={{ scale: 0.97 }}
			transition={springs.snappy}
			className="flex h-8 items-center pointer-coarse:h-11 gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3 text-xs font-medium text-neutral-500 transition-[border-color,background-color,color] duration-150 disabled:pointer-events-none disabled:opacity-40 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
		>
			<Add size={12} strokeWidth={1.8} aria-hidden="true" />
			Capture
		</motion.button>
	);
}

/**
 * Record toggle: sits left of Capture. Armed, it turns solid red with a pulsing
 * dot; each pause in typing captures a step (debounced in the store). Manual
 * Capture keeps working alongside it.
 */
function RecordButton() {
	const isRecording = useSnippetStore((s) => s.isRecording);
	const startRecording = useSnippetStore((s) => s.startRecording);
	const stopRecording = useSnippetStore((s) => s.stopRecording);
	const reduceMotion = useReducedMotion();
	const pulsing = isRecording && !reduceMotion;

	const className = isRecording
		? "flex h-8 items-center pointer-coarse:h-11 gap-1.5 rounded-xl border border-red-400/60 bg-red-500/10 px-3 text-xs font-medium text-red-500 transition-[background-color,border-color,color] duration-150"
		: "flex h-8 items-center pointer-coarse:h-11 gap-1.5 rounded-xl border border-transparent px-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 transition-[background-color,color] duration-150 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

	return (
		<StudioTooltip content="Auto-capture after each pause">
			<motion.button
				type="button"
				onClick={() => (isRecording ? stopRecording() : startRecording())}
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				aria-pressed={isRecording}
				className={className}
			>
				<motion.span
					aria-hidden="true"
					className="inline-block size-2 shrink-0 rounded-full"
					style={{ background: isRecording ? "#ef4444" : "currentColor" }}
					animate={pulsing ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
					transition={
						pulsing
							? { duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
							: { duration: 0 }
					}
				/>
				{isRecording ? "Recording…" : "Record"}
			</motion.button>
		</StudioTooltip>
	);
}

/**
 * Compact focus input on a step card: spotlight lines like "2-4, 7". Commits on
 * blur/Enter via `parseLineRanges`; an unparseable value tints the border red and
 * is not committed (quiet, no toast). Applied at render time, so edits are instant.
 */
/**
 * The scene list's rows have no label above the field, so their placeholder
 * names it; the inspector labels it, and its placeholder shows the format.
 */
function FocusInput({
	step,
	index,
	id,
	placeholder = "focus 2-4,7",
}: { step: Step; index: number; id?: string; placeholder?: string }) {
	const updateStepFocus = useSnippetStore((s) => s.updateStepFocus);
	const [text, setText] = useState(() => formatLineRanges(step.highlightRanges));
	const [refusal, setRefusal] = useState<string | null>(null);
	const invalid = refusal !== null;

	function commit() {
		// Untouched, it is what the project holds (a saved "8-10" on a five-line
		// scene included): the field's refusals and clamp are for what is typed.
		if (text === formatLineRanges(step.highlightRanges)) {
			setRefusal(null);
			return;
		}
		const lineCount = frameLineCount(step.code);
		const parsed = parseLineRanges(text, lineCount);
		if (parsed === null) {
			const pastEnd = firstLinePastEnd(text, lineCount);
			setRefusal(
				pastEnd === null
					? "Use line numbers, like 2-4, 7"
					: `Line ${pastEnd} is past the last line (${lineCount})`,
			);
			return;
		}
		setRefusal(null);
		// Snap the field to the canonical form ("2-4,7" → "2-4, 7", "1-99" on a
		// 5-line scene → "1-5"): the card no longer remounts on edit (step ids are
		// stable), so sync explicitly.
		setText(formatLineRanges(parsed));
		updateStepFocus(step.id, parsed);
	}

	const borderClasses = invalid
		? "border-red-400/70 focus:border-red-400 dark:border-red-500/50 dark:focus:border-red-500"
		: "border-neutral-200/70 focus:border-neutral-300 dark:border-neutral-800 dark:focus:border-neutral-700";

	// The inspector labels its field and has room under it, so a rejected range
	// is named there in words; a scene-list row keeps the red edge alone.
	const errorId = id ? `${id}-error` : undefined;
	const field = (
		<StudioTooltip content="Spotlight lines · e.g. 2–4, 7">
			<input
				id={id}
				aria-invalid={invalid}
				aria-describedby={invalid ? errorId : undefined}
				type="text"
				value={text}
				aria-label={`Scene ${index + 1} focus lines`}
				spellCheck={false}
				autoComplete="off"
				onChange={(e) => {
					setText(e.target.value);
					setRefusal(null);
				}}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.currentTarget.blur();
					}
				}}
				onClick={(e) => e.stopPropagation()}
				placeholder={placeholder}
				className={`w-full truncate rounded-lg border bg-white px-1.5 py-1 font-mono text-[11px] pointer-coarse:h-11 pointer-coarse:text-base text-neutral-600 transition placeholder:text-neutral-500 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500 ${borderClasses}`}
			/>
		</StudioTooltip>
	);
	if (!errorId) {
		return field;
	}
	return (
		<>
			{field}
			{invalid ? (
				<span id={errorId} className="text-[11px] leading-4 text-red-600 dark:text-red-400">
					{refusal}
				</span>
			) : null}
		</>
	);
}

/**
 * Compact caption input on a step card: the line of prose shown beneath the
 * frame while this step holds. Commits on blur/Enter. Capped at
 * `MAX_ANNOTATION_LENGTH` so the caption stays the single line the layout
 * reserves for it: the domain rejects anything longer.
 */
function CaptionInput({
	step,
	index,
	id,
	placeholder = "caption…",
}: { step: Step; index: number; id?: string; placeholder?: string }) {
	const updateStepAnnotation = useSnippetStore((s) => s.updateStepAnnotation);
	const [text, setText] = useState(() => step.annotation ?? "");

	return (
		<StudioTooltip content="Caption beneath this scene">
			<input
				id={id}
				type="text"
				value={text}
				aria-label={`Scene ${index + 1} caption`}
				autoComplete="off"
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
				maxLength={MAX_ANNOTATION_LENGTH}
				placeholder={placeholder}
				className="w-full truncate rounded-lg border border-neutral-200/70 bg-white px-1.5 py-1 text-[11px] pointer-coarse:h-11 pointer-coarse:text-base text-neutral-600 transition placeholder:text-neutral-500 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500 dark:focus:border-neutral-700"
			/>
		</StudioTooltip>
	);
}
