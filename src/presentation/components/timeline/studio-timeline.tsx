import {
	type StudioSceneLayerKind,
	studioSceneLayerKinds,
} from "@/application/project/studio-composition";
import {
	bubbleEdgeAtProgress,
	buildStudioTimeline,
	indexAtProgress,
	playbackProgressOnRuler,
	resizeDuration,
	stepProgress,
} from "@/application/studio-timeline/model";
import type { Step } from "@/domain/entities/step";
import { EasingEditor } from "@/presentation/components/timeline/easing-editor";
import { timelineMotion } from "@/presentation/components/timeline/timeline-motion";
import { SceneDeletionUndo } from "@/presentation/components/ui/scene-deletion-undo";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback, feedbackPulse } from "@/presentation/haptics";
import { useSceneDeletion } from "@/presentation/hooks/use-scene-deletion";
import { type TempoMs, useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
import { isEditableEventTarget } from "@/presentation/utils/editable-target";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type DragEvent,
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Add,
	Bezier2,
	Copy,
	Image as ImageGlyph,
	Music,
	Next,
	Pause,
	Play,
	Previous,
	TextInputFocus,
	Trash,
	Video,
	WavePulse,
	X,
} from "reicon-react";

const PIXELS_PER_SECOND = 100;
type LayoutMotionMode = "settle" | "instant" | "direct";
type TimelineContextMotion = ReturnType<typeof timelineMotion>["context"];
type TimelineLayoutTransition = ReturnType<typeof timelineMotion>["layout"];
const TEMPO_OPTIONS = [
	{ value: 400, label: "Snappy", seconds: "0.4" },
	{ value: 650, label: "Smooth", seconds: "0.65" },
	{ value: 1000, label: "Cinematic", seconds: "1.0" },
] as const satisfies readonly { value: TempoMs; label: string; seconds: string }[];

export function StudioTimeline() {
	const steps = useSnippetStore((state) => state.snippet.steps);
	const compositionProject = useStudioCompositionStore((state) => state.value.project);
	const currentStepIndex = useSnippetStore((state) => state.currentStepIndex);
	const setCurrentStepIndex = useSnippetStore((state) => state.setCurrentStepIndex);
	const captureStep = useSnippetStore((state) => state.captureStep);
	const duplicateStep = useSnippetStore((state) => state.duplicateStep);
	const reorderSteps = useSnippetStore((state) => state.reorderSteps);
	const updateStepDuration = useSnippetStore((state) => state.updateStepDuration);
	const isPlaying = useSnippetStore((state) => state.isPlaying);
	const isPreparing = useSnippetStore((state) => state.isPreparing);
	const playbackProgress = useSnippetStore((state) => state.playbackProgress);
	const playback = useSnippetStore((state) => state.playback);
	const seekPlayback = useSnippetStore((state) => state.seekPlayback);
	const play = useSnippetStore((state) => state.play);
	const pause = useSnippetStore((state) => state.pause);
	const transitionMs = useExportStore((state) => state.transitionMs);
	const setTransitionMs = useExportStore((state) => state.setTransitionMs);
	const transitionEasing = useExportStore((state) => state.transitionEasing);
	const setTransitionEasing = useExportStore((state) => state.setTransitionEasing);
	const scrollRef = useRef<HTMLDivElement>(null);
	const easingAnchorRef = useRef<HTMLDivElement>(null);
	const [activeTransitionIndex, setActiveTransitionIndex] = useState<number | null>(null);
	const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
	const [resizingStepId, setResizingStepId] = useState<string | null>(null);
	const [layoutMotionMode, setLayoutMotionMode] = useState<LayoutMotionMode>("settle");
	const [easingOpen, setEasingOpen] = useState(false);
	const { pendingDeletion, deleteScene, undoDeletion } = useSceneDeletion();
	const reduceMotion = useReducedMotion() === true;
	const motionConfig = useMemo(
		() => timelineMotion(reduceMotion, layoutMotionMode === "settle"),
		[layoutMotionMode, reduceMotion],
	);
	const layerKindsByScene = useMemo(
		() =>
			new Map(steps.map((step) => [step.id, studioSceneLayerKinds(compositionProject, step.id)])),
		[compositionProject, steps],
	);

	const model = useMemo(
		() =>
			buildStudioTimeline(
				steps.map((step) => step.duration),
				transitionMs,
			),
		[steps, transitionMs],
	);
	const progress = playback
		? playbackProgressOnRuler(model, playbackProgress)
		: stepProgress(model, currentStepIndex);
	const selectedStepId = steps[currentStepIndex]?.id;
	const selectedStep = steps[currentStepIndex];
	const elapsedMs = playback
		? Math.min(Math.max(playbackProgress, 0), 1) * model.actualDurationMs
		: Math.min(progress * model.displayDurationMs, model.actualDurationMs);
	const addAt = model.actualDurationMs / model.displayDurationMs;
	const trackWidthPx = Math.round((model.displayDurationMs / 1000) * PIXELS_PER_SECOND);
	const draggedStepIndex = draggedStepId
		? steps.findIndex((step) => step.id === draggedStepId)
		: -1;

	// `instant` is a one-paint contract for keyboard edits and gesture release.
	// `direct` stays active for the whole resize gesture so neighbouring clips
	// follow the pointer one-to-one instead of chasing it through a spring.
	useEffect(() => {
		if (layoutMotionMode === "instant") {
			setLayoutMotionMode("settle");
		}
	}, [layoutMotionMode]);

	useEffect(() => {
		if (!isPlaying || !scrollRef.current) {
			return;
		}
		const scroller = scrollRef.current;
		const playheadX = progress * Math.max(scroller.scrollWidth, trackWidthPx);
		const safeLeft = scroller.scrollLeft + scroller.clientWidth * 0.18;
		const safeRight = scroller.scrollLeft + scroller.clientWidth * 0.82;
		let target = scroller.scrollLeft;
		if (playheadX < safeLeft) {
			target = playheadX - scroller.clientWidth * 0.28;
		} else if (playheadX > safeRight) {
			target = playheadX - scroller.clientWidth * 0.7;
		} else {
			return;
		}
		const clamped = Math.min(
			Math.max(scroller.scrollWidth - scroller.clientWidth, 0),
			Math.max(target, 0),
		);
		if (reduceMotion) {
			scroller.scrollLeft = clamped;
			return;
		}
		const delta = clamped - scroller.scrollLeft;
		scroller.scrollLeft = Math.abs(delta) < 0.5 ? clamped : scroller.scrollLeft + delta * 0.22;
	}, [isPlaying, progress, reduceMotion, trackWidthPx]);

	// A selection can come from the editor cards, the transport, or the ruler.
	// Keep that scene visible, but leave the strip alone during playback: the
	// playhead's safe-zone follow above is deliberately smoother than snapping
	// every newly-current clip into view.
	useEffect(() => {
		if (isPlaying || !selectedStepId) {
			return;
		}
		scrollRef.current
			?.querySelector<HTMLElement>(".studio-timeline-clip[data-selected]")
			?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [isPlaying, selectedStepId]);

	const selectStep = (index: number) => {
		if (isPlaying) {
			pause();
		}
		feedback("selection");
		setEasingOpen(false);
		setActiveTransitionIndex(null);
		setCurrentStepIndex(index);
	};

	const scrub = (next: number) => {
		if (isPlaying) {
			pause();
		}
		setActiveTransitionIndex(null);
		const elapsed = Math.min(next * model.displayDurationMs, model.actualDurationMs);
		seekPlayback(model.actualDurationMs > 0 ? elapsed / model.actualDurationMs : 0);
		feedbackPulse("snap");
	};

	const selectTransition = (index: number) => {
		const transition = model.transitions[index];
		if (!transition || model.actualDurationMs <= 0) {
			return;
		}
		if (isPlaying) {
			pause();
		}
		setActiveTransitionIndex(index);
		setEasingOpen(false);
		seekPlayback((transition.startMs + transition.endMs) / 2 / model.actualDurationMs);
		feedback("selection");
	};

	const applyTransitionTempo = (tempo: TempoMs) => {
		setTransitionMs(tempo);
		if (activeTransitionIndex !== null) {
			const nextModel = buildStudioTimeline(
				steps.map((step) => step.duration),
				tempo,
			);
			const transition = nextModel.transitions[activeTransitionIndex];
			if (transition && nextModel.actualDurationMs > 0) {
				seekPlayback((transition.startMs + transition.endMs) / 2 / nextModel.actualDurationMs);
			}
		}
		feedback("commit");
	};

	const deleteSelectedStep = () => {
		if (!selectedStep) {
			return;
		}
		if (isPlaying) {
			pause();
		}
		setActiveTransitionIndex(null);
		setEasingOpen(false);
		deleteScene(selectedStep, currentStepIndex);
		feedback("commit");
	};

	const moveSelectedStep = (direction: -1 | 1) => {
		if (!selectedStep) {
			return;
		}
		const targetIndex = currentStepIndex + direction;
		if (targetIndex < 0 || targetIndex >= steps.length) {
			feedback("error");
			return;
		}
		const ids = steps.map((step) => step.id);
		ids.splice(currentStepIndex, 1);
		ids.splice(targetIndex, 0, selectedStep.id);
		reorderSteps(ids);
		setCurrentStepIndex(targetIndex);
		feedback("commit");
	};

	const reorderDraggedStep = (targetIndex: number) => {
		if (!draggedStepId) {
			return;
		}
		const sourceIndex = steps.findIndex((step) => step.id === draggedStepId);
		if (sourceIndex < 0 || sourceIndex === targetIndex) {
			setDraggedStepId(null);
			setDropTargetIndex(null);
			return;
		}
		const ids = steps.map((step) => step.id);
		ids.splice(sourceIndex, 1);
		ids.splice(targetIndex, 0, draggedStepId);
		reorderSteps(ids);
		setCurrentStepIndex(targetIndex);
		setDraggedStepId(null);
		setDropTargetIndex(null);
		feedback("commit");
	};

	const onTimelineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (isEditableEventTarget(event.nativeEvent)) {
			return;
		}
		if (event.key === "Escape" && easingOpen) {
			event.preventDefault();
			setEasingOpen(false);
			return;
		}
		if (event.key === "Escape" && activeTransitionIndex !== null) {
			event.preventDefault();
			setActiveTransitionIndex(null);
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && pendingDeletion) {
			event.preventDefault();
			if (undoDeletion()) {
				feedback("commit");
			}
			return;
		}
		if (event.altKey && event.key === "ArrowLeft" && selectedStep) {
			event.preventDefault();
			setLayoutMotionMode("instant");
			moveSelectedStep(-1);
			return;
		}
		if (event.altKey && event.key === "ArrowRight" && selectedStep) {
			event.preventDefault();
			setLayoutMotionMode("instant");
			moveSelectedStep(1);
			return;
		}
		if ((event.key === "Delete" || event.key === "Backspace") && selectedStep) {
			event.preventDefault();
			setLayoutMotionMode("instant");
			deleteSelectedStep();
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedStep) {
			event.preventDefault();
			setLayoutMotionMode("instant");
			duplicateStep(selectedStep.id);
			feedback("commit");
			return;
		}
		if (event.key === "Home" && steps.length > 0) {
			event.preventDefault();
			selectStep(0);
			return;
		}
		if (event.key === "End" && steps.length > 0) {
			event.preventDefault();
			selectStep(steps.length - 1);
		}
	};

	return (
		<section
			className="studio-timeline"
			aria-label="Animation timeline"
			aria-keyshortcuts="Delete Backspace Meta+D Control+D Meta+Z Control+Z Alt+ArrowLeft Alt+ArrowRight Home End"
			onKeyDown={onTimelineKeyDown}
		>
			<header className="studio-timeline-transport">
				<div className="studio-timeline-context-rail">
					<AnimatePresence initial={false}>
						{activeTransitionIndex !== null && model.transitions[activeTransitionIndex] ? (
							<TransitionContext
								key="transition-context"
								index={activeTransitionIndex}
								transitionMs={transitionMs}
								motionConfig={motionConfig.context}
								onTempo={applyTransitionTempo}
								onClose={() => setActiveTransitionIndex(null)}
							/>
						) : selectedStep ? (
							<motion.section
								key="scene-context"
								className="studio-scene-context"
								aria-label={`Selected scene ${currentStepIndex + 1}`}
								initial={motionConfig.context.initial}
								animate={motionConfig.context.animate}
								exit={motionConfig.context.exit}
							>
								<span className="studio-scene-thumbnail" aria-hidden="true">
									<CodeFilmFrame code={selectedStep.code} />
								</span>
								<strong>Scene {currentStepIndex + 1}</strong>
								<label className="studio-scene-duration">
									<span className="sr-only">Scene {currentStepIndex + 1} duration in seconds</span>
									<input
										type="number"
										min={0.4}
										max={10}
										step={0.1}
										value={selectedStep.duration / 1000}
										onChange={(event) => {
											const seconds = Number.parseFloat(event.target.value);
											if (Number.isFinite(seconds) && seconds >= 0.4 && seconds <= 10) {
												setLayoutMotionMode("instant");
												updateStepDuration(selectedStep.id, Math.round(seconds * 1000));
											}
										}}
									/>
									<span aria-hidden="true">s</span>
								</label>
								<div ref={easingAnchorRef} className="studio-easing-anchor">
									<button
										type="button"
										aria-label="Edit transition easing"
										aria-haspopup="dialog"
										aria-expanded={easingOpen}
										data-active={easingOpen ? "" : undefined}
										onClick={() => {
											setEasingOpen((open) => !open);
											feedback("toggle");
										}}
									>
										<Bezier2 size={14} strokeWidth={1.65} aria-hidden="true" />
										<span className="studio-scene-action-label">Easing</span>
									</button>
									<AnimatePresence initial={false}>
										{easingOpen && (
											<EasingEditor
												key="transition-easing-editor"
												value={transitionEasing}
												onChange={setTransitionEasing}
												anchor={easingAnchorRef.current}
												onRequestClose={() => setEasingOpen(false)}
											/>
										)}
									</AnimatePresence>
								</div>
								<button
									type="button"
									onClick={() => {
										duplicateStep(selectedStep.id);
										feedback("commit");
									}}
									aria-label={`Duplicate scene ${currentStepIndex + 1}`}
								>
									<Copy size={14} strokeWidth={1.65} aria-hidden="true" />
									<span className="studio-scene-action-label">Duplicate</span>
								</button>
								<span className="studio-scene-separator" aria-hidden="true" />
								<button
									type="button"
									onClick={deleteSelectedStep}
									aria-label={`Delete scene ${currentStepIndex + 1}`}
									className="studio-scene-delete"
								>
									<Trash size={14} strokeWidth={1.65} aria-hidden="true" />
									<span className="studio-scene-action-label">Delete</span>
								</button>
							</motion.section>
						) : (
							<motion.span
								key="no-scene"
								className="studio-scene-context-empty"
								initial={motionConfig.context.initial}
								animate={motionConfig.context.animate}
								exit={motionConfig.context.exit}
							>
								No scene selected
							</motion.span>
						)}
					</AnimatePresence>
					<AnimatePresence initial={false}>
						{pendingDeletion && (
							<SceneDeletionUndo
								key="scene-deletion-undo"
								minimal
								sceneNumber={pendingDeletion.sceneNumber}
								onUndo={() => {
									if (undoDeletion()) {
										feedback("commit");
									}
								}}
							/>
						)}
					</AnimatePresence>
				</div>
				<div className="studio-timeline-actions">
					<StudioTooltip content="Go to start">
						<button
							type="button"
							onClick={() => selectStep(0)}
							disabled={steps.length === 0}
							aria-label="Jump to project start"
						>
							<Previous size={14} weight="Filled" aria-hidden="true" />
						</button>
					</StudioTooltip>
					<StudioTooltip content={isPlaying ? "Pause" : "Play"}>
						<button
							type="button"
							onClick={() => {
								feedback("toggle");
								if (isPlaying) {
									pause();
									return;
								}
								void play();
							}}
							disabled={steps.length < 2 || isPreparing}
							aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
							className="studio-timeline-play"
						>
							{isPlaying ? (
								<Pause size={15} weight="Filled" aria-hidden="true" />
							) : (
								<Play
									className="studio-timeline-play-glyph"
									size={15}
									weight="Filled"
									aria-hidden="true"
								/>
							)}
						</button>
					</StudioTooltip>
					<StudioTooltip content="Go to end">
						<button
							type="button"
							onClick={() => selectStep(Math.max(steps.length - 1, 0))}
							disabled={steps.length === 0}
							aria-label="Jump to project end"
						>
							<Next size={14} weight="Filled" aria-hidden="true" />
						</button>
					</StudioTooltip>
				</div>
				<div className="studio-timeline-time">
					<output className="studio-timeline-clock" aria-live="off">
						{formatClock(elapsedMs)}
					</output>
					<span aria-hidden="true">/</span>
					<span className="studio-timeline-total">{formatRulerEnd(model.displayDurationMs)}</span>
				</div>
			</header>

			<div ref={scrollRef} className="studio-timeline-scroll">
				<div
					className="studio-timeline-track"
					style={
						{
							"--timeline-track-width": `${trackWidthPx}px`,
							"--timeline-second-width": `${(1000 * 100) / model.displayDurationMs}%`,
						} as CSSProperties
					}
				>
					<div className="studio-timeline-clips">
						{model.transitions.map((transition) => (
							<button
								key={`transition-${transition.index}`}
								type="button"
								className="studio-timeline-transition"
								data-active={activeTransitionIndex === transition.index ? "" : undefined}
								aria-pressed={activeTransitionIndex === transition.index}
								aria-label={`Morph between scene ${transition.index + 1} and ${transition.index + 2}, ${formatMorphSeconds(transitionMs)} seconds`}
								style={
									{
										left: `${(transition.startMs / model.displayDurationMs) * 100}%`,
										width: `${((transition.endMs - transition.startMs) / model.displayDurationMs) * 100}%`,
									} as CSSProperties
								}
								onClick={() => selectTransition(transition.index)}
							>
								<span aria-hidden="true">
									<WavePulse size={13} strokeWidth={1.7} />
								</span>
							</button>
						))}
						{model.clips.map((clip) => {
							const step = steps[clip.index];
							if (!step) {
								return null;
							}
							const isDropTarget = dropTargetIndex === clip.index && draggedStepId !== step.id;
							let dropEdge: "before" | "after" | undefined;
							if (isDropTarget && draggedStepIndex >= 0) {
								dropEdge = draggedStepIndex < clip.index ? "after" : "before";
							}
							return (
								<TimelineClip
									key={step.id}
									step={step}
									index={clip.index}
									layerKinds={layerKindsByScene.get(step.id) ?? []}
									selected={clip.index === currentStepIndex}
									dragged={draggedStepId === step.id}
									dropTarget={isDropTarget}
									dropEdge={dropEdge}
									resizing={resizingStepId === step.id}
									animateLayout={layoutMotionMode === "settle" && !reduceMotion}
									layoutTransition={motionConfig.layout}
									style={
										{
											left: `${(clip.startMs / model.displayDurationMs) * 100}%`,
											width: `${((clip.endMs - clip.startMs) / model.displayDurationMs) * 100}%`,
										} as CSSProperties
									}
									onSelect={() => selectStep(clip.index)}
									onDuration={(duration) => updateStepDuration(step.id, duration)}
									onDurationStart={() => {
										setResizingStepId(step.id);
										setLayoutMotionMode("direct");
									}}
									onDurationEnd={() => {
										setResizingStepId(null);
										setLayoutMotionMode("instant");
									}}
									onDragStart={(event) => {
										setLayoutMotionMode("settle");
										setDraggedStepId(step.id);
										setCurrentStepIndex(clip.index);
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/plain", step.id);
									}}
									onDragEnter={(event) => {
										event.preventDefault();
										if (draggedStepId !== step.id) {
											setDropTargetIndex(clip.index);
										}
									}}
									onDragOver={(event) => {
										event.preventDefault();
										event.dataTransfer.dropEffect = "move";
									}}
									onDrop={(event) => {
										event.preventDefault();
										reorderDraggedStep(clip.index);
									}}
									onDragEnd={() => {
										setDraggedStepId(null);
										setDropTargetIndex(null);
									}}
								/>
							);
						})}

						<button
							type="button"
							onClick={() => {
								feedback("commit");
								captureStep();
							}}
							className="studio-timeline-add"
							style={{ left: `${addAt * 100}%` }}
						>
							<Add size={14} strokeWidth={1.6} aria-hidden="true" />
							Add scene
						</button>

						<div
							className="studio-timeline-playhead"
							data-edge={bubbleEdgeAtProgress(progress)}
							data-playing={isPlaying ? "" : undefined}
							style={
								{
									"--timeline-progress-shift": `${(progress - 1) * 100}%`,
								} as CSSProperties
							}
						>
							<span className="studio-timeline-playhead-line" aria-hidden="true" />
							<output className="studio-timeline-bubble" aria-live="off">
								{formatClock(elapsedMs)}
							</output>
						</div>
					</div>

					<div className="studio-timeline-ruler">
						{model.ticks.map((second) => (
							<span
								key={second}
								className="studio-timeline-tick"
								data-end={second === model.ticks.at(-1) ? "" : undefined}
								style={{ left: `${(second * 1000 * 100) / model.displayDurationMs}%` }}
							>
								{second > 0 ? `${second}s` : "0s"}
							</span>
						))}
						<input
							type="range"
							min={0}
							max={1000}
							value={Math.round(progress * 1000)}
							onChange={(event) => scrub(Number(event.target.value) / 1000)}
							aria-label="Scrub timeline"
							aria-valuetext={
								steps.length === 0
									? "No scenes"
									: `${formatClock(elapsedMs)}, scene ${indexAtProgress(model, progress) + 1} of ${steps.length}`
							}
							className="studio-timeline-scrubber"
						/>
					</div>
				</div>
			</div>
		</section>
	);
}

function TransitionContext({
	index,
	transitionMs,
	motionConfig,
	onTempo,
	onClose,
}: {
	index: number;
	transitionMs: TempoMs;
	motionConfig: TimelineContextMotion;
	onTempo: (tempo: TempoMs) => void;
	onClose: () => void;
}) {
	return (
		<motion.section
			className="studio-transition-context"
			aria-label={`Morph ${index + 1} to ${index + 2}`}
			initial={motionConfig.initial}
			animate={motionConfig.animate}
			exit={motionConfig.exit}
		>
			<span className="studio-transition-mark" aria-hidden="true">
				<WavePulse size={14} strokeWidth={1.7} />
			</span>
			<div className="studio-transition-copy">
				<strong>
					Morph {index + 1} → {index + 2}
				</strong>
				<span>Every transition</span>
			</div>
			<fieldset className="studio-transition-tempos">
				<legend className="sr-only">Morph tempo</legend>
				{TEMPO_OPTIONS.map((option) => (
					<button
						key={option.value}
						type="button"
						data-active={transitionMs === option.value ? "" : undefined}
						aria-pressed={transitionMs === option.value}
						aria-label={`Use ${option.label.toLowerCase()} ${option.seconds} second morphs`}
						onClick={() => onTempo(option.value)}
					>
						<span>{option.label}</span>
						<small>{option.seconds}s</small>
					</button>
				))}
			</fieldset>
			<button
				type="button"
				className="studio-transition-close"
				onClick={onClose}
				aria-label="Close morph controls"
			>
				<X size={14} strokeWidth={1.7} aria-hidden="true" />
			</button>
		</motion.section>
	);
}

function TimelineClip({
	step,
	index,
	layerKinds,
	selected,
	dragged,
	dropTarget,
	dropEdge,
	resizing,
	animateLayout,
	layoutTransition,
	style,
	onSelect,
	onDuration,
	onDurationStart,
	onDurationEnd,
	onDragStart,
	onDragEnter,
	onDragOver,
	onDrop,
	onDragEnd,
}: {
	step: Step;
	index: number;
	layerKinds: readonly StudioSceneLayerKind[];
	selected: boolean;
	dragged: boolean;
	dropTarget: boolean;
	dropEdge?: "before" | "after";
	resizing: boolean;
	animateLayout: boolean;
	layoutTransition: TimelineLayoutTransition;
	style: CSSProperties;
	onSelect: () => void;
	onDuration: (duration: number) => void;
	onDurationStart: () => void;
	onDurationEnd: () => void;
	onDragStart: (event: DragEvent<HTMLDivElement>) => void;
	onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
	onDragOver: (event: DragEvent<HTMLDivElement>) => void;
	onDrop: (event: DragEvent<HTMLDivElement>) => void;
	onDragEnd: () => void;
}) {
	return (
		<motion.div
			layout={animateLayout ? "position" : false}
			transition={layoutTransition}
			className="studio-timeline-clip"
			data-selected={selected ? "" : undefined}
			data-dragged={dragged ? "" : undefined}
			data-drop-target={dropTarget ? "" : undefined}
			data-drop-edge={dropEdge}
			data-resizing={resizing ? "" : undefined}
			style={style}
		>
			{/* Motion owns layout interpolation on the outer clip. Native HTML drag
			    lives on a plain DOM child: motion.div reserves onDragStart/onDragEnd
			    for its gesture system, so placing native handlers on it silently
			    swallowed mouse reordering even though the keyboard path worked. */}
			<div
				className="studio-timeline-clip-drag-surface"
				draggable
				onDragStart={onDragStart}
				onDragEnter={onDragEnter}
				onDragOver={onDragOver}
				onDrop={onDrop}
				onDragEnd={onDragEnd}
			>
				<button
					type="button"
					onClick={onSelect}
					aria-current={selected ? "step" : undefined}
					aria-label={`Scene ${index + 1}, ${formatDuration(step.duration)}${layerKinds.length > 0 ? `, with ${layerKinds.join(", ")}` : ""}`}
					aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
					className="studio-timeline-clip-face"
				>
					<span className="studio-timeline-clip-number">{index + 1}</span>
					<CodeFilmFrame code={step.code} />
					{layerKinds.length > 0 ? (
						<span className="studio-timeline-layer-marks" aria-hidden="true">
							{layerKinds.map((kind) => (
								<span key={kind} data-kind={kind}>
									{kind === "text" ? <TextInputFocus size={9} /> : null}
									{kind === "image" ? <ImageGlyph size={9} /> : null}
									{kind === "video" ? <Video size={9} /> : null}
									{kind === "audio" ? <Music size={9} /> : null}
								</span>
							))}
						</span>
					) : null}
					<span className="studio-timeline-clip-duration">{formatDuration(step.duration)}</span>
				</button>
			</div>
			{selected && (
				<DurationHandle
					duration={step.duration}
					onChange={onDuration}
					onStart={onDurationStart}
					onEnd={onDurationEnd}
					label={`Resize end of scene ${index + 1}`}
				/>
			)}
		</motion.div>
	);
}

function DurationHandle({
	duration,
	onChange,
	onStart,
	onEnd,
	label,
}: {
	duration: number;
	onChange: (duration: number) => void;
	onStart: () => void;
	onEnd: () => void;
	label: string;
}) {
	const drag = useRef<{
		pointerId: number;
		startX: number;
		startDuration: number;
		lastDuration: number;
	} | null>(null);

	const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		onStart();
		drag.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startDuration: duration,
			lastDuration: duration,
		};
	};

	const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
		const active = drag.current;
		if (!active || active.pointerId !== event.pointerId) {
			return;
		}
		const next = resizeDuration(active.startDuration, event.clientX - active.startX);
		if (next === active.lastDuration) {
			return;
		}
		active.lastDuration = next;
		onChange(next);
		feedbackPulse("snap");
	};

	const finish = (event: PointerEvent<HTMLSpanElement>) => {
		if (drag.current?.pointerId !== event.pointerId) {
			return;
		}
		drag.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		feedback("commit");
		onEnd();
	};

	const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
		let direction = 0;
		if (event.key === "ArrowLeft") {
			direction = -1;
		}
		if (event.key === "ArrowRight") {
			direction = 1;
		}
		if (direction === 0) {
			return;
		}
		event.preventDefault();
		const pixels = direction * (event.shiftKey ? 25 : 5);
		onStart();
		onChange(resizeDuration(duration, pixels));
		onEnd();
		feedback("snap");
	};

	return (
		<span
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuemin={400}
			aria-valuemax={10000}
			aria-valuenow={duration}
			aria-valuetext={formatDuration(duration)}
			tabIndex={0}
			className="studio-timeline-resize"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={finish}
			onPointerCancel={finish}
			onKeyDown={onKeyDown}
		/>
	);
}

function CodeFilmFrame({ code }: { code: string }) {
	const lines = code.split("\n").slice(0, 5);
	return (
		<pre className="studio-timeline-code" aria-hidden="true">
			{lines.join("\n")}
		</pre>
	);
}

function formatClock(milliseconds: number): string {
	const safe = Math.max(milliseconds, 0);
	const minutes = Math.floor(safe / 60_000);
	const seconds = Math.floor((safe % 60_000) / 1000);
	const tenths = Math.floor((safe % 1000) / 100);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function formatDuration(milliseconds: number): string {
	return `${(Math.max(milliseconds, 0) / 1000).toFixed(1)}s`;
}

function formatMorphSeconds(milliseconds: number): string {
	return milliseconds === 650 ? "0.65" : (milliseconds / 1000).toFixed(1);
}

function formatRulerEnd(milliseconds: number): string {
	return `${Math.ceil(milliseconds / 1000)}s`;
}
