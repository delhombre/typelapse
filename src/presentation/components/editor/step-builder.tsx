import { captureBlockReason } from "@/application/export/render-block";
import {
	firstLinePastEnd,
	formatLineRanges,
	parseLineRanges,
} from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import { sceneListWindow } from "@/application/studio-timeline/scene-list-window";
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
import { springs } from "@/presentation/motion";
import { hasEmptyDraft, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Add } from "reicon-react";
import { StudioLayerStrip } from "./studio-layer-strip";

/**
 * A row's entrance: none for a scene the list already held, a short rise for one
 * that was just added, and under reduced motion a fade alone. No blur: a filter
 * on every row of a long list is a layer per row.
 */
function rowEntrance(known: boolean, reduce: boolean) {
	if (known) {
		return false;
	}
	return reduce ? { opacity: 0 } : { opacity: 0, y: 6 };
}

/** The first line of a scene's code. The row's own ellipsis is the only truncation. */
function getStepPreview(code: string): string {
	return (code.split("\n")[0] ?? "").trim().slice(0, 240);
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
	const reduce = useReducedMotion() === true;

	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
	const [expanded, setExpanded] = useState(false);
	const dragCounterRef = useRef(0);
	const headRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const reasonId = useId();
	const selectedStepId = steps[currentStepIndex]?.id;
	const reason = captureBlockReason(emptyDraft);

	// Only a scene added after the list mounted enters with motion. The ids the
	// list already held (on first paint, or behind the "show all" button) are
	// there already: twenty rows fading in because a button was pressed is
	// motion nobody asked for.
	const knownIds = useRef<Set<string>>(new Set(steps.map((step) => step.id)));
	useEffect(() => {
		knownIds.current = new Set(steps.map((step) => step.id));
	}, [steps]);

	// A long list shows a window of itself, so the code below it stays in reach on
	// a phone (the sheet stacks this above the editor). Open, it is every row.
	const windowed = sceneListWindow({ count: steps.length, selected: currentStepIndex });
	const collapsible = windowed.hidden > 0;
	const shown = collapsible && !expanded ? windowed : { start: 0, end: steps.length, hidden: 0 };

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

	// After a delete the list is shorter and the scroller keeps its offset, which
	// can leave the head (the count and Capture) above the fold. Bring it back.
	const previousCount = useRef(steps.length);
	useEffect(() => {
		if (steps.length < previousCount.current) {
			headRef.current?.scrollIntoView?.({ block: "nearest" });
		}
		previousCount.current = steps.length;
	}, [steps.length]);

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

	const rows = steps.slice(shown.start, shown.end);

	return (
		<div className="sc-scenes">
			<div className="sc-scenes-head" ref={headRef}>
				<span className="sc-scenes-count">
					{steps.length} {steps.length === 1 ? "scene" : "scenes"}
				</span>
				<div className="sc-scenes-actions">
					<RecordButton />
					<BlankSceneButton onAdd={addBlankScene} />
					<CaptureButton
						onCapture={captureStep}
						disabled={emptyDraft}
						describedBy={reason ? reasonId : undefined}
					/>
				</div>
			</div>

			{reason ? (
				<p id={reasonId} className="sc-scenes-reason">
					{reason}
				</p>
			) : null}

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

			{steps.length === 0 && !emptyDraft && (
				<p className="sc-scenes-empty">Capture the code to add your first scene.</p>
			)}

			{/* No cap and no scroll of its own: the list used to carry a 192px max-height
			    inside the card's own 228px scroller, which is two scroll regions stacked one
			    inside the other (the wheel drove the inner one to its end and then stopped,
			    40px short of the last step, with the outer scrollbar still showing room).
			    The card owns the scroll now, on both layouts. */}
			<div ref={listRef} className="sc-scene-list">
				{rows.map((step, offset) => {
					const index = shown.start + offset;
					const isSelected = index === currentStepIndex;
					const isDragged = index === draggedIndex;
					const isDropTarget = index === dropTargetIndex && !isDragged;
					return (
						<motion.div
							key={step.id}
							initial={rowEntrance(knownIds.current.has(step.id), reduce)}
							animate={{ opacity: 1, y: 0 }}
							transition={reduce ? { duration: 0 } : springs.snappy}
							draggable
							onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, index)}
							onDragEnd={handleDragEnd}
							onDragEnter={(e) => handleDragEnter(e as unknown as React.DragEvent, index)}
							onDragLeave={handleDragLeave}
							onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent)}
							onDrop={(e) => handleDrop(e as unknown as React.DragEvent, index)}
							className="sc-scene-row"
							data-step-selected={isSelected ? "" : undefined}
							data-selected={isSelected ? "" : undefined}
							data-dragging={isDragged ? "" : undefined}
							data-drop={isDropTarget ? "" : undefined}
						>
							{/* Row 1: handle, number and preview, duration, remove */}
							<div className="sc-scene-row-head">
								<StudioTooltip content="Drag to reorder">
									<span className="sc-scene-handle">
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

								<button
									type="button"
									onClick={() => setCurrentStepIndex(index)}
									className="sc-scene-pick"
								>
									<span className="sc-scene-number">{index + 1}</span>
									<span className="sc-scene-preview" data-code={step.hasCode ? "" : undefined}>
										{step.hasCode ? getStepPreview(step.code) : "No code"}
									</span>
								</button>

								<div className="sc-scene-seconds">
									<StudioTooltip content="Duration in seconds">
										<SceneDurationInput
											durationMs={step.duration}
											onCommit={(durationMs) => updateStepDuration(step.id, durationMs)}
											aria-label={`Scene ${index + 1} duration in seconds`}
											onClick={(e) => e.stopPropagation()}
											className="sc-scene-field sc-scene-duration-field"
										/>
									</StudioTooltip>
									<span aria-hidden="true">s</span>
								</div>

								{/* Its target is bounded to the room the row has rather than grown to
								    the shared 44px square: that square reached 3px past the row and
								    covered the top edge of the caption field below it, so a press aimed
								    at the caption deleted the step instead. The mark stays 24px, the
								    floor this density is allowed, and the pseudo-element claims only the
								    gaps that border it; under a finger it grows to the row's height and
								    still stops at its edge. */}
								<StudioTooltip content={`Delete scene ${index + 1}`}>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											deleteScene(step, index);
											feedback("commit");
										}}
										className="sc-scene-delete"
										aria-label={`Delete scene ${index + 1}`}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											aria-hidden="true"
										>
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</StudioTooltip>
							</div>

							{/* Row 2: spotlight lines and caption. A blank scene has no code to
							    spotlight, so its caption takes the whole row. */}
							<div className="sc-scene-fields" data-solo={step.hasCode ? undefined : ""}>
								{step.hasCode ? (
									<FocusInput step={step} index={index} id={`row-${step.id}-focus`} hiddenLabel />
								) : null}
								<CaptionInput step={step} index={index} id={`row-${step.id}-caption`} hiddenLabel />
							</div>
						</motion.div>
					);
				})}
			</div>

			{collapsible ? (
				<button
					type="button"
					className="sc-scenes-toggle"
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? "Show fewer scenes" : `Show all ${steps.length} scenes`}
				</button>
			) : null}
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
	const reasonId = useId();
	const step = steps[currentStepIndex];
	const selectedScene = composition.value.project.scenes.find(
		(scene) => scene.id === composition.selectedSceneId,
	);
	const selectedBlock = selectedScene?.blocks.find(
		(block) => block.id === composition.selectedBlockId,
	);
	const isLayerSelected =
		selectedAudioCueId !== null || (selectedBlock !== undefined && selectedBlock.kind !== "code");
	const reason = captureBlockReason(emptyDraft);

	// With no scene the reason is the whole hint; with one, it says why Capture is off
	// under the line that says what the scene's fields are.
	const hint = isLayerSelected
		? "Layer controls for this scene."
		: step?.hasCode
			? "Focus and caption for the selected scene."
			: step
				? "Caption for this scene without code."
				: (reason ?? "Capture a scene to animate this code.");
	const extraReason = !isLayerSelected && step ? reason : null;
	const describedBy = reason && !isLayerSelected ? reasonId : undefined;

	return (
		<div className="sc-scenes">
			<div className="grid gap-1.5">
				{/* The three add controls outgrow a narrow island: they wrap under the
				    label rather than breaking "Scene 1 of 3" over two lines. */}
				<div className="sc-scenes-head" data-wrap="">
					<p className="sc-scenes-title">
						{step ? `Scene ${currentStepIndex + 1} of ${steps.length}` : "No scene yet"}
					</p>
					{/* While a layer is open the section's job is navigation, and the
					    layer's fields need the room more than a second way to add a scene. */}
					{isLayerSelected ? null : (
						<div className="sc-scenes-actions">
							<RecordButton />
							<BlankSceneButton onAdd={addBlankScene} />
							<CaptureButton
								onCapture={captureStep}
								disabled={emptyDraft}
								describedBy={describedBy}
							/>
						</div>
					)}
				</div>
				<p id={step ? undefined : reasonId} className="sc-scenes-reason">
					{hint}
				</p>
				{extraReason ? (
					<p id={reasonId} className="sc-scenes-reason">
						{extraReason}
					</p>
				) : null}
			</div>

			<StudioLayerStrip />

			{step && !isLayerSelected && (
				// No entrance: this swaps on every scene selection, keyboard ones included.
				<div
					key={step.id}
					className="sc-scene-fields sc-scene-fields-labelled"
					data-solo={step.hasCode ? undefined : ""}
				>
					{step.hasCode ? (
						<label htmlFor={`scene-${step.id}-focus`} className="sc-scene-labelled">
							<span>Focus lines</span>
							<FocusInput
								id={`scene-${step.id}-focus`}
								step={step}
								index={currentStepIndex}
								placeholder="2-4, 7"
							/>
						</label>
					) : null}
					<label htmlFor={`scene-${step.id}-caption`} className="sc-scene-labelled">
						<span>Caption</span>
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
			<button
				type="button"
				onClick={() => {
					onAdd();
					feedback("commit");
				}}
				className="sc-scene-action"
			>
				Blank
			</button>
		</StudioTooltip>
	);
}

function CaptureButton({
	onCapture,
	disabled,
	describedBy,
}: { onCapture: () => void; disabled: boolean; describedBy?: string | undefined }) {
	return (
		<button
			type="button"
			disabled={disabled}
			aria-describedby={describedBy}
			onClick={() => {
				onCapture();
				feedback("commit");
			}}
			className="sc-scene-action"
			data-kind="capture"
		>
			<Add size={12} strokeWidth={1.8} aria-hidden="true" />
			Capture
		</button>
	);
}

/**
 * Record toggle: sits left of Capture. Armed, it takes the studio's error ink and
 * a pulsing dot (`--camera-danger`: the one red a state is allowed); each pause in
 * typing captures a step (debounced in the store). Manual Capture keeps working
 * alongside it.
 */
function RecordButton() {
	const isRecording = useSnippetStore((s) => s.isRecording);
	const startRecording = useSnippetStore((s) => s.startRecording);
	const stopRecording = useSnippetStore((s) => s.stopRecording);
	const reduceMotion = useReducedMotion();
	const pulsing = isRecording && !reduceMotion;

	return (
		<StudioTooltip content="Auto-capture after each pause">
			<button
				type="button"
				onClick={() => (isRecording ? stopRecording() : startRecording())}
				aria-pressed={isRecording}
				className="sc-scene-action"
				data-kind="record"
			>
				<motion.span
					aria-hidden="true"
					className="sc-scene-record-dot"
					animate={pulsing ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
					transition={
						pulsing
							? { duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
							: { duration: 0 }
					}
				/>
				{isRecording ? "Recording…" : "Record"}
			</button>
		</StudioTooltip>
	);
}

/**
 * Compact focus input on a step card: spotlight lines like "2-4, 7". Commits on
 * blur/Enter via `parseLineRanges`; an unparseable value rings the field in the
 * error colour and is not committed (quiet, no toast). Applied at render time, so
 * edits are instant.
 *
 * The scene list's rows have no label above the field, so a visually hidden
 * `<label>` names it and the placeholder shows the format; the inspector shows
 * its label.
 */
function FocusInput({
	step,
	index,
	id,
	placeholder = "focus 2-4,7",
	hiddenLabel = false,
}: { step: Step; index: number; id: string; placeholder?: string; hiddenLabel?: boolean }) {
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

	// Both surfaces name a rejected range in words under the field: the rows used
	// to keep a red edge alone, which says nothing to anyone who cannot tell red.
	const errorId = `${id}-error`;
	return (
		<>
			{hiddenLabel ? (
				<label htmlFor={id} className="sr-only">{`Scene ${index + 1} focus lines`}</label>
			) : null}
			<StudioTooltip content="Spotlight lines, like 2-4, 7">
				<input
					id={id}
					aria-invalid={invalid}
					aria-describedby={invalid ? errorId : undefined}
					type="text"
					value={text}
					{...(hiddenLabel ? {} : { "aria-label": `Scene ${index + 1} focus lines` })}
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
					className="sc-scene-field"
					data-mono=""
				/>
			</StudioTooltip>
			{invalid ? (
				<span id={errorId} role="alert" className="sc-scene-error">
					{refusal}
				</span>
			) : null}
		</>
	);
}

/**
 * Compact caption input on a step card: the line of prose shown beneath the
 * frame while this step holds. Commits on blur/Enter. Capped at
 * `MAX_ANNOTATION_LENGTH` so the caption stays within the two lines the layout
 * reserves for it: the domain rejects anything longer.
 */
function CaptionInput({
	step,
	index,
	id,
	placeholder = "caption…",
	hiddenLabel = false,
}: { step: Step; index: number; id: string; placeholder?: string; hiddenLabel?: boolean }) {
	const updateStepAnnotation = useSnippetStore((s) => s.updateStepAnnotation);
	const [text, setText] = useState(() => step.annotation ?? "");

	return (
		<div className="min-w-0">
			{hiddenLabel ? (
				<label htmlFor={id} className="sr-only">{`Scene ${index + 1} caption`}</label>
			) : null}
			<StudioTooltip content="Caption beneath this scene">
				<input
					id={id}
					type="text"
					value={text}
					{...(hiddenLabel ? {} : { "aria-label": `Scene ${index + 1} caption` })}
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
					className="sc-scene-field"
				/>
			</StudioTooltip>
		</div>
	);
}
