import type {
	AudioCuePayload,
	BlockPayload,
	ProjectDocumentV2,
	ScenePayload,
} from "@/application/project/project-document";
import { StudioTooltip, StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type DragEvent as ReactDragEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import "./multimedia-timeline.css";

const POINTER_TRANSITION = {
	duration: 0.18,
	ease: [0.16, 1, 0.3, 1] as const,
};
const INSTANT_TRANSITION = { duration: 0 } as const;
const SCENE_VARIANTS = {
	initial: (animated: boolean) =>
		animated ? { opacity: 0, x: 10, scale: 0.975 } : { opacity: 1, x: 0, scale: 1 },
	present: { opacity: 1, x: 0, scale: 1 },
	exit: (animated: boolean) =>
		animated ? { opacity: 0, x: -8, scale: 0.975 } : { opacity: 1, x: 0, scale: 1 },
};

export interface MultimediaTimelineProps {
	readonly document: ProjectDocumentV2;
	readonly selected: string | null;
	readonly onSelect: (sceneId: string) => void;
	readonly onAdd: () => void;
	readonly onDelete: (sceneId: string) => void;
	readonly onMoveScene?: (sceneId: string, targetIndex: number) => void;
	readonly onUndo: () => void;
	readonly onRedo: () => void;
	readonly playing?: boolean;
	readonly onTogglePlayback?: () => void;
	readonly onReturnToSelected?: () => void;
	readonly canUndo?: boolean;
	readonly canRedo?: boolean;
	readonly canDelete?: boolean;
	readonly playheadProgress?: number;
	readonly onSeekProgress?: (progress: number) => void;
	readonly selectedAudioCueId?: string | null;
	readonly onSelectAudioCue?: (cueId: string) => void;
	readonly disabled?: boolean;
	readonly className?: string;
	readonly renderSceneThumbnail?: (scene: ScenePayload, index: number) => ReactNode;
}

function compactDuration(durationMs: number): string {
	const seconds = durationMs / 1_000;
	return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

function spokenDuration(durationMs: number): string {
	const seconds = durationMs / 1_000;
	const value = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
	return `${value} ${seconds === 1 ? "second" : "seconds"}`;
}

function timecode(durationMs: number): string {
	const safe = Math.max(0, durationMs);
	const totalTenths = Math.round(safe / 100);
	const minutes = Math.floor(totalTenths / 600);
	const seconds = (totalTenths - minutes * 600) / 10;
	return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function titleCase(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function blockSummary(blocks: readonly BlockPayload[]): string {
	const kinds = [...new Set(blocks.map((block) => block.kind))];
	if (kinds.length === 0) {
		return "Empty scene";
	}
	if (kinds.length === 1) {
		return titleCase(kinds[0] ?? "scene");
	}
	return kinds.map(titleCase).join(" + ");
}

function MiniatureBlock({ block }: { readonly block: BlockPayload }) {
	const style = {
		"--mtl-block-x": `${block.placement.x * 100}%`,
		"--mtl-block-y": `${block.placement.y * 100}%`,
		"--mtl-block-width": `${block.placement.width * 100}%`,
		"--mtl-block-height": `${block.placement.height * 100}%`,
		"--mtl-block-opacity": block.opacity,
	} as CSSProperties;
	return <span className="mtl-miniature-block" data-kind={block.kind} style={style} />;
}

function SceneMiniature({ scene }: { readonly scene: ScenePayload }) {
	return (
		<span className="mtl-miniature" aria-hidden="true">
			{scene.blocks.slice(0, 6).map((block) => (
				<MiniatureBlock key={block.id} block={block} />
			))}
			{scene.blocks.length === 0 ? <span className="mtl-miniature-empty" /> : null}
		</span>
	);
}

function Icon({
	name,
}: {
	readonly name: "add" | "delete" | "earlier" | "later" | "redo" | "undo" | "wave";
}) {
	if (name === "add") {
		return (
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<path d="M10 4.5v11M4.5 10h11" />
			</svg>
		);
	}
	if (name === "delete") {
		return (
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<path d="M4.75 6.25h10.5M8 3.75h4M6.5 6.25l.55 9h5.9l.55-9M8.25 8.5v4.75M11.75 8.5v4.75" />
			</svg>
		);
	}
	if (name === "wave") {
		return (
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<path d="M3 10h2m2-4v8m3-11v14m3-10v6m3-3h1" />
			</svg>
		);
	}
	if (name === "earlier" || name === "later") {
		return (
			<svg viewBox="0 0 20 20" aria-hidden="true" data-later={name === "later" ? "" : undefined}>
				<path d="M12.75 4.75 7.5 10l5.25 5.25" />
			</svg>
		);
	}
	const redo = name === "redo";
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" data-redo={redo ? "" : undefined}>
			<path d="M7 6H4v-3M4.25 6.1A6 6 0 1 1 5.1 14" />
		</svg>
	);
}

function ActionButton({
	label,
	icon,
	disabled,
	onClick,
	danger = false,
}: {
	readonly label: string;
	readonly icon: "delete" | "earlier" | "later" | "redo" | "undo";
	readonly disabled: boolean;
	readonly onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	readonly danger?: boolean;
}) {
	return (
		<StudioTooltip content={label} side="top">
			<button
				type="button"
				className="mtl-action"
				data-danger={danger ? "" : undefined}
				aria-label={label}
				disabled={disabled}
				onClick={onClick}
			>
				<span className="mtl-action-surface">
					<Icon name={icon} />
				</span>
			</button>
		</StudioTooltip>
	);
}

function visualDurationMs(scenes: readonly ScenePayload[]): number {
	return scenes.reduce(
		(total, scene) => total + scene.durationMs + (scene.transitionOut?.durationMs ?? 0),
		0,
	);
}

function cueDurationMs(cue: AudioCuePayload): number {
	return cue.trim.endMs - cue.trim.startMs;
}

function projectDurationMs(document: ProjectDocumentV2): number {
	return Math.max(
		visualDurationMs(document.project.scenes),
		...document.project.audioCues.map((cue) => cue.startMs + cueDurationMs(cue)),
		1,
	);
}

function AudioRail({
	document,
	selectedCueId,
	onSelectCue,
}: {
	readonly document: ProjectDocumentV2;
	readonly selectedCueId?: string | null;
	readonly onSelectCue?: (cueId: string) => void;
}) {
	const { assets, audioCues, scenes } = document.project;
	if (audioCues.length === 0) {
		return null;
	}
	const visualEndMs = visualDurationMs(scenes);
	const durationMs = Math.max(
		visualEndMs,
		...audioCues.map((cue) => cue.startMs + cueDurationMs(cue)),
		1,
	);
	const assetNames = new Map(assets.map((asset) => [asset.id, asset.fileName]));

	return (
		<fieldset className="mtl-audio">
			<legend className="mtl-visually-hidden">Audio track</legend>
			<span className="mtl-audio-mark" aria-hidden="true">
				<Icon name="wave" />
			</span>
			<div className="mtl-audio-track">
				{audioCues.map((cue, index) => {
					const lengthMs = cueDurationMs(cue);
					const label = assetNames.get(cue.assetId) ?? `Audio ${index + 1}`;
					const style = {
						"--mtl-cue-start": `${(cue.startMs / durationMs) * 100}%`,
						"--mtl-cue-width": `${(lengthMs / durationMs) * 100}%`,
					} as CSSProperties;
					return (
						<button
							type="button"
							key={cue.id}
							className="mtl-audio-cue"
							style={style}
							aria-label={`${label}, ${spokenDuration(lengthMs)}`}
							aria-pressed={cue.id === selectedCueId}
							disabled={!onSelectCue}
							onClick={() => onSelectCue?.(cue.id)}
						>
							<span aria-hidden="true">{label}</span>
						</button>
					);
				})}
			</div>
			<span className="mtl-audio-duration" aria-hidden="true">
				{compactDuration(durationMs)}
			</span>
		</fieldset>
	);
}

/**
 * Controlled multimedia timeline. History and document mutations remain in the
 * project store/use case; this component only exposes immediate, synchronous actions.
 */
export function MultimediaTimeline({
	document,
	selected,
	onSelect,
	onAdd,
	onDelete,
	onMoveScene,
	onUndo,
	onRedo,
	playing = false,
	onTogglePlayback,
	onReturnToSelected,
	canUndo = false,
	canRedo = false,
	canDelete = true,
	playheadProgress = 0,
	onSeekProgress,
	selectedAudioCueId,
	onSelectAudioCue,
	disabled = false,
	className,
	renderSceneThumbnail,
}: MultimediaTimelineProps) {
	const reduceMotion = useReducedMotion() === true;
	const scenes = document.project.scenes;
	const sceneSignature = useMemo(() => JSON.stringify(scenes.map((scene) => scene.id)), [scenes]);
	const committedSignature = useRef(sceneSignature);
	const pointerMutation = useRef(false);
	const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
	const [dropTargetSceneId, setDropTargetSceneId] = useState<string | null>(null);
	const structuralChange = committedSignature.current !== sceneSignature;
	const animateStructuralChange = structuralChange && pointerMutation.current && !reduceMotion;

	useEffect(() => {
		committedSignature.current = sceneSignature;
		pointerMutation.current = false;
	}, [sceneSignature]);

	const armStructuralMotion = (event: ReactMouseEvent<HTMLButtonElement>) => {
		pointerMutation.current = event.detail > 0 && !reduceMotion;
		const signatureAtActivation = committedSignature.current;
		queueMicrotask(() => {
			if (committedSignature.current === signatureAtActivation) {
				pointerMutation.current = false;
			}
		});
	};

	const selectedScene = scenes.find((scene) => scene.id === selected);
	const selectedSceneIndex = selectedScene
		? scenes.findIndex((scene) => scene.id === selectedScene.id)
		: -1;
	const sceneCountLabel = `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}`;
	const rootClassName = ["multimedia-timeline", className].filter(Boolean).join(" ");
	const durationMs = projectDurationMs(document);
	const clampedProgress = Math.min(Math.max(playheadProgress, 0), 1);
	const moveSelectedScene = (delta: -1 | 1, event: ReactMouseEvent<HTMLButtonElement>) => {
		if (!selectedScene || !onMoveScene || selectedSceneIndex < 0) {
			return;
		}
		armStructuralMotion(event);
		onMoveScene(selectedScene.id, selectedSceneIndex + delta);
	};
	const moveSceneFromKeyboard = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		sceneId: string,
		index: number,
	) => {
		if (!event.altKey || !onMoveScene) {
			return;
		}
		if (event.key === "ArrowLeft" && index > 0) {
			event.preventDefault();
			onMoveScene(sceneId, index - 1);
		}
		if (event.key === "ArrowRight" && index < scenes.length - 1) {
			event.preventDefault();
			onMoveScene(sceneId, index + 1);
		}
	};
	const dropScene = (event: ReactDragEvent<HTMLLIElement>, targetIndex: number) => {
		event.preventDefault();
		const sceneId = draggedSceneId ?? event.dataTransfer.getData("text/typelapse-scene");
		setDraggedSceneId(null);
		setDropTargetSceneId(null);
		if (!sceneId || !onMoveScene) {
			return;
		}
		pointerMutation.current = !reduceMotion;
		onMoveScene(sceneId, targetIndex);
	};

	return (
		<section
			className={rootClassName}
			aria-label="Project timeline"
			aria-disabled={disabled || undefined}
			data-disabled={disabled ? "" : undefined}
			data-motion={animateStructuralChange ? "pointer" : "instant"}
		>
			<header className="mtl-header">
				<div className="mtl-heading">
					<h2>{selectedScene ? `Scene ${selectedSceneIndex + 1}` : "No scene selected"}</h2>
					<span>{sceneCountLabel}</span>
				</div>
				<fieldset className="mtl-transport">
					<legend className="mtl-visually-hidden">Playback controls</legend>
					<button
						type="button"
						aria-label="Return to selected scene"
						disabled={!selectedScene || !onReturnToSelected}
						onClick={onReturnToSelected}
					>
						<svg viewBox="0 0 20 20" aria-hidden="true">
							<path d="M7 5.5v9M14.5 5.75 9.5 10l5 4.25Z" />
						</svg>
					</button>
					<button
						type="button"
						aria-label={playing ? "Pause" : "Play"}
						disabled={!onTogglePlayback}
						onClick={onTogglePlayback}
					>
						{playing ? (
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M7 5.5v9M13 5.5v9" />
							</svg>
						) : (
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="m7.25 5.25 7.5 4.75-7.5 4.75Z" />
							</svg>
						)}
					</button>
				</fieldset>
				<StudioTooltipProvider>
					<fieldset className="mtl-actions">
						<legend className="mtl-visually-hidden">Timeline history and scene actions</legend>
						<span className="mtl-header-time">
							{timecode(durationMs * clampedProgress)} / {timecode(durationMs)}
						</span>
						<ActionButton
							label="Undo"
							icon="undo"
							disabled={disabled || !canUndo}
							onClick={(event) => {
								armStructuralMotion(event);
								onUndo();
							}}
						/>
						<ActionButton
							label="Redo"
							icon="redo"
							disabled={disabled || !canRedo}
							onClick={(event) => {
								armStructuralMotion(event);
								onRedo();
							}}
						/>
						<span className="mtl-action-divider" aria-hidden="true" />
						<ActionButton
							label="Move scene earlier"
							icon="earlier"
							disabled={disabled || !onMoveScene || selectedSceneIndex <= 0}
							onClick={(event) => moveSelectedScene(-1, event)}
						/>
						<ActionButton
							label="Move scene later"
							icon="later"
							disabled={
								disabled ||
								!onMoveScene ||
								selectedSceneIndex < 0 ||
								selectedSceneIndex >= scenes.length - 1
							}
							onClick={(event) => moveSelectedScene(1, event)}
						/>
						<span className="mtl-action-divider" aria-hidden="true" />
						<ActionButton
							label="Delete selected scene"
							icon="delete"
							danger
							disabled={disabled || !selectedScene || !canDelete}
							onClick={(event) => {
								if (!selectedScene) {
									return;
								}
								armStructuralMotion(event);
								onDelete(selectedScene.id);
							}}
						/>
					</fieldset>
				</StudioTooltipProvider>
			</header>
			<div className="mtl-playhead-row">
				<input
					type="range"
					className="mtl-playhead"
					aria-label="Playhead"
					min={0}
					max={1_000}
					step={1}
					value={Math.round(clampedProgress * 1_000)}
					disabled={disabled || !onSeekProgress}
					style={{ "--mtl-playhead-progress": `${clampedProgress * 100}%` } as CSSProperties}
					onChange={(event) => onSeekProgress?.(Number(event.currentTarget.value) / 1_000)}
				/>
			</div>

			<div className="mtl-scene-rail">
				{scenes.length === 0 ? (
					<output className="mtl-empty" aria-live="polite">
						<span>No scenes yet</span>
						<small>Add a scene to begin arranging the story.</small>
					</output>
				) : (
					<ol className="mtl-scene-list">
						<AnimatePresence initial={false} mode="popLayout" custom={animateStructuralChange}>
							{scenes.map((scene, index) => {
								const isSelected = scene.id === selected;
								const summary = blockSummary(scene.blocks);
								return (
									<motion.li
										key={scene.id}
										className="mtl-scene-item"
										data-scene-id={scene.id}
										data-dragging={draggedSceneId === scene.id ? "" : undefined}
										data-drop-target={dropTargetSceneId === scene.id ? "" : undefined}
										draggable={!disabled && Boolean(onMoveScene)}
										onDragStartCapture={(event: ReactDragEvent<HTMLLIElement>) => {
											setDraggedSceneId(scene.id);
											event.dataTransfer.effectAllowed = "move";
											event.dataTransfer.setData("text/typelapse-scene", scene.id);
										}}
										onDragEnter={() => setDropTargetSceneId(scene.id)}
										onDragOver={(event) => {
											event.preventDefault();
											event.dataTransfer.dropEffect = "move";
										}}
										onDrop={(event) => dropScene(event, index)}
										onDragEndCapture={() => {
											setDraggedSceneId(null);
											setDropTargetSceneId(null);
										}}
										custom={animateStructuralChange}
										variants={SCENE_VARIANTS}
										initial="initial"
										animate="present"
										exit="exit"
										transition={animateStructuralChange ? POINTER_TRANSITION : INSTANT_TRANSITION}
										style={
											{
												"--mtl-scene-width": `${Math.min(300, Math.max(132, scene.durationMs * 0.075))}px`,
											} as CSSProperties
										}
									>
										<button
											type="button"
											className="mtl-scene"
											aria-pressed={isSelected}
											aria-label={`Scene ${index + 1}, ${spokenDuration(scene.durationMs)}, ${summary}`}
											disabled={disabled}
											onClick={() => onSelect(scene.id)}
											onKeyDown={(event) => moveSceneFromKeyboard(event, scene.id, index)}
										>
											{renderSceneThumbnail ? (
												<span className="mtl-thumbnail-slot">
													{renderSceneThumbnail(scene, index)}
												</span>
											) : (
												<SceneMiniature scene={scene} />
											)}
											<span className="mtl-scene-meta">
												<span className="mtl-scene-number">
													{String(index + 1).padStart(2, "0")}
												</span>
												<span className="mtl-scene-kind">{summary}</span>
												<span className="mtl-scene-duration">
													{compactDuration(scene.durationMs)}
												</span>
											</span>
										</button>
									</motion.li>
								);
							})}
						</AnimatePresence>
					</ol>
				)}

				<button
					type="button"
					className="mtl-add"
					aria-label="Add scene"
					disabled={disabled}
					onClick={(event) => {
						armStructuralMotion(event);
						onAdd();
					}}
				>
					<span className="mtl-add-mark" aria-hidden="true">
						<Icon name="add" />
					</span>
					<span>Add scene</span>
				</button>
			</div>

			<AudioRail
				document={document}
				selectedCueId={selectedAudioCueId}
				onSelectCue={onSelectAudioCue}
			/>
		</section>
	);
}
