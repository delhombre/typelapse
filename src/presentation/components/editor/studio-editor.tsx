import {
	deleteAudioCue,
	selectAudioCue as resolveAudioCue,
	updateAudioCue,
} from "@/application/project/audio-cue-authoring";
import {
	type LayerOrderAction,
	MIN_VIDEO_TRIM_MS,
	type UpdateLayerPlacementPatch,
	reorderLayer,
	updateLayerPlacement,
	updateMediaLayer,
	updateTextLayer,
} from "@/application/project/multimedia-authoring";
import type { BlockPlacement, ImageBlock, TextBlock, VideoBlock } from "@/domain/entities/block";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { studioMediaRegistry } from "@/presentation/studio-media-runtime";
import { type ChangeEvent, type ReactNode, useEffect, useState } from "react";
import { ArrowDown, ArrowDownSquare, ArrowUp, ArrowUpSquare, Trash } from "reicon-react";
import { CodeEditor } from "./code-editor";

function safeAudioSelection(
	project: Parameters<typeof resolveAudioCue>[0],
	cueId: string | null,
): ReturnType<typeof resolveAudioCue> | null {
	if (!cueId) {
		return null;
	}
	try {
		return resolveAudioCue(project, cueId);
	} catch {
		return null;
	}
}

/**
 * The code editor stays mounted while a layer's inspector covers it. Swapping
 * it out remounted Monaco on every layer selection, and each mount made two new
 * worker blob URLs that were never revoked. The same element sits first in
 * every branch, so React keeps it; `hidden` takes it out of sight and of the
 * accessibility tree, and Monaco relayouts when it is shown again.
 */
function withCodeEditor(layerEditor: ReactNode | null) {
	return (
		<>
			<div className="flex h-full flex-col" hidden={layerEditor !== null}>
				<CodeEditor />
			</div>
			{layerEditor}
		</>
	);
}

export function StudioEditor() {
	const composition = useStudioCompositionStore();
	const selectedAudioCueId = useStudioCompositionSelectionStore(
		(state) => state.selectedAudioCueId,
	);
	const selectAuthoredAudio = useStudioCompositionSelectionStore((state) => state.selectAudioCue);
	const scene = composition.value.project.scenes.find(
		(candidate) => candidate.id === composition.selectedSceneId,
	);
	const block = scene?.blocks.find((candidate) => candidate.id === composition.selectedBlockId);
	const audioSelection = safeAudioSelection(composition.value.project, selectedAudioCueId);

	if (selectedAudioCueId && audioSelection) {
		return withCodeEditor(
			<AudioLayerEditor
				fileName={audioSelection.asset.metadata.fileName}
				cue={audioSelection.cue}
				sourceDurationMs={audioSelection.asset.metadata.durationMs}
				sourceAvailable={studioMediaRegistry.resolve(audioSelection.asset.id) !== null}
				onPatch={(patch) =>
					composition.transact((project) => updateAudioCue(project, selectedAudioCueId, patch))
				}
				onDelete={() => {
					composition.transact((project) => deleteAudioCue(project, selectedAudioCueId));
					selectAuthoredAudio(null);
					feedback("commit");
				}}
			/>,
		);
	}

	if (!scene || !block || block.kind === "code") {
		return withCodeEditor(null);
	}
	if (block.kind === "text") {
		const blockIndex = scene.blocks.findIndex((candidate) => candidate.id === block.id);
		return withCodeEditor(
			<TextLayerEditor
				block={block}
				onPatch={(patch) =>
					composition.transact((project) => updateTextLayer(project, scene.id, block.id, patch))
				}
				onDelete={() => {
					composition.transact((project) => project.removeBlock(scene.id, block.id));
					composition.selectBlock(scene.id, null);
					feedback("commit");
				}}
				onPlacement={(patch) =>
					composition.transact((project) =>
						updateLayerPlacement(project, scene.id, block.id, patch),
					)
				}
				onOrder={(action) =>
					composition.transact((project) => reorderLayer(project, scene.id, block.id, action))
				}
				layerIndex={blockIndex}
				layerCount={scene.blocks.length}
			/>,
		);
	}
	const asset = composition.value.project.assets.find(
		(candidate) => candidate.id === block.assetId,
	);
	return withCodeEditor(
		<MediaLayerEditor
			block={block}
			fileName={asset?.metadata.fileName ?? "Media"}
			sourceDurationMs={asset?.metadata.kind === "video" ? asset.metadata.durationMs : null}
			sceneDurationMs={scene.durationMs}
			onPatch={(patch) =>
				composition.transact((project) => updateMediaLayer(project, scene.id, block.id, patch))
			}
			onDelete={() => {
				composition.transact((project) => project.removeBlock(scene.id, block.id));
				composition.selectBlock(scene.id, null);
				feedback("commit");
			}}
			onPlacement={(patch) =>
				composition.transact((project) => updateLayerPlacement(project, scene.id, block.id, patch))
			}
			onOrder={(action) =>
				composition.transact((project) => reorderLayer(project, scene.id, block.id, action))
			}
			layerIndex={scene.blocks.findIndex((candidate) => candidate.id === block.id)}
			layerCount={scene.blocks.length}
		/>,
	);
}

function finiteNumber(event: ChangeEvent<HTMLInputElement>, apply: (value: number) => void) {
	const value = event.currentTarget.valueAsNumber;
	if (Number.isFinite(value)) {
		apply(value);
	}
}

function formatSeconds(ms: number): string {
	return (ms / 1000).toFixed(1);
}

/**
 * Seconds in the field, integer milliseconds in the model. An empty or
 * out-of-range entry is ignored here: the cue and block invariants throw on it,
 * and a throw inside a change handler would only leave a console error.
 */
function SecondsField({
	label,
	valueMs,
	minMs,
	maxMs,
	onCommit,
}: {
	label: string;
	valueMs: number;
	minMs: number;
	maxMs: number;
	onCommit: (valueMs: number) => void;
}) {
	const safeMaxMs = Math.max(minMs, maxMs);
	return (
		<label className="sc-layer-field">
			<span>{label}</span>
			<input
				type="number"
				min={minMs / 1000}
				max={safeMaxMs / 1000}
				step={0.1}
				value={valueMs / 1000}
				onChange={(event) => {
					const nextMs = Math.round(event.currentTarget.valueAsNumber * 1000);
					if (!Number.isSafeInteger(nextMs) || nextMs < minMs || nextMs > safeMaxMs) {
						return;
					}
					onCommit(nextMs);
				}}
			/>
		</label>
	);
}

/**
 * A clip and its scene rarely share a length. Say what the preview and the
 * export will do with the difference instead of letting a held last frame or
 * a cut-off clip pass for normal playback.
 */
function videoTimingNote(block: VideoBlock, sceneDurationMs: number): string {
	const playedMs = Math.round((block.trim.endMs - block.trim.startMs) / block.playbackRate);
	if (playedMs + 50 < sceneDurationMs) {
		return `Holds its last frame for the final ${formatSeconds(sceneDurationMs - playedMs)} s of the scene`;
	}
	if (playedMs > sceneDurationMs + 50) {
		return `The scene ends first: the last ${formatSeconds(playedMs - sceneDurationMs)} s are not shown`;
	}
	return "Fills the scene";
}

function EditorHeader({
	eyebrow,
	title,
	onDelete,
}: {
	eyebrow: string;
	title: string;
	onDelete: () => void;
}) {
	return (
		<header className="sc-layer-editor-head">
			<span>
				<small>{eyebrow}</small>
				<StudioTooltip content={title}>
					<strong>{title}</strong>
				</StudioTooltip>
			</span>
			<button type="button" onClick={onDelete} aria-label={`Delete ${eyebrow.toLowerCase()}`}>
				<Trash size={14} aria-hidden="true" />
			</button>
		</header>
	);
}

function TextLayerEditor({
	block,
	onPatch,
	onDelete,
	onPlacement,
	onOrder,
	layerIndex,
	layerCount,
}: {
	block: TextBlock;
	onPatch: (patch: Parameters<typeof updateTextLayer>[3]) => void;
	onDelete: () => void;
	onPlacement: (patch: UpdateLayerPlacementPatch) => void;
	onOrder: (action: LayerOrderAction) => void;
	layerIndex: number;
	layerCount: number;
}) {
	const [draft, setDraft] = useState(block.text);
	useEffect(() => setDraft(block.text), [block.text]);
	return (
		<div className="sc-layer-editor">
			<EditorHeader eyebrow="Text layer" title="Text" onDelete={onDelete} />
			<label className="sc-layer-field sc-layer-field-grow">
				<span>Content</span>
				<textarea
					value={draft}
					onChange={(event) => {
						const text = event.currentTarget.value;
						setDraft(text);
						if (text.trim()) {
							onPatch({ text });
						}
					}}
					onBlur={() => {
						if (!draft.trim()) {
							setDraft(block.text);
						}
					}}
					aria-label="Text layer content"
				/>
			</label>
			<div className="sc-layer-grid">
				<label className="sc-layer-field">
					<span>Size</span>
					<input
						type="number"
						min={12}
						max={240}
						value={block.typography.fontSize}
						onChange={(event) => finiteNumber(event, (fontSize) => onPatch({ fontSize }))}
					/>
				</label>
				<label className="sc-layer-field">
					<span>Weight</span>
					<input
						type="number"
						min={100}
						max={900}
						step={50}
						value={block.typography.fontWeight}
						onChange={(event) => finiteNumber(event, (fontWeight) => onPatch({ fontWeight }))}
					/>
				</label>
				<label className="sc-layer-field">
					<span>Align</span>
					<select
						value={block.typography.align}
						onChange={(event) =>
							onPatch({ align: event.currentTarget.value as "left" | "center" | "right" })
						}
					>
						<option value="left">Left</option>
						<option value="center">Center</option>
						<option value="right">Right</option>
					</select>
				</label>
				<label className="sc-layer-field sc-layer-color">
					<span>Color</span>
					<input
						type="color"
						value={block.typography.color}
						onChange={(event) => onPatch({ color: event.currentTarget.value })}
					/>
				</label>
			</div>
			<StudioLayerCompositionControls
				placement={block.placement}
				onPlacement={onPlacement}
				onOrder={onOrder}
				layerIndex={layerIndex}
				layerCount={layerCount}
			/>
		</div>
	);
}

function MediaLayerEditor({
	block,
	fileName,
	sourceDurationMs,
	sceneDurationMs,
	onPatch,
	onDelete,
	onPlacement,
	onOrder,
	layerIndex,
	layerCount,
}: {
	block: ImageBlock | VideoBlock;
	fileName: string;
	sourceDurationMs: number | null;
	sceneDurationMs: number;
	onPatch: (patch: Parameters<typeof updateMediaLayer>[3]) => void;
	onDelete: () => void;
	onPlacement: (patch: UpdateLayerPlacementPatch) => void;
	onOrder: (action: LayerOrderAction) => void;
	layerIndex: number;
	layerCount: number;
}) {
	return (
		<div className="sc-layer-editor">
			<EditorHeader eyebrow={`${block.kind} layer`} title={fileName} onDelete={onDelete} />
			<StudioLayerCompositionControls
				placement={block.placement}
				onPlacement={onPlacement}
				onOrder={onOrder}
				layerIndex={layerIndex}
				layerCount={layerCount}
			/>
			<div className="sc-layer-grid">
				<label className="sc-layer-field">
					<span>Fit</span>
					<select
						value={block.fit}
						onChange={(event) => onPatch({ fit: event.currentTarget.value as "cover" | "contain" })}
					>
						<option value="cover">Cover</option>
						<option value="contain">Contain</option>
					</select>
				</label>
				<label className="sc-layer-field">
					<span>Radius</span>
					<input
						type="number"
						min={0}
						max={240}
						value={block.borderRadius}
						onChange={(event) => finiteNumber(event, (borderRadius) => onPatch({ borderRadius }))}
					/>
				</label>
			</div>
			<label className="sc-layer-field sc-layer-range">
				<span>Horizontal focus</span>
				<input
					type="range"
					min={0}
					max={100}
					value={Math.round(block.focalPoint.x * 100)}
					onChange={(event) =>
						onPatch({ focalPoint: { x: event.currentTarget.valueAsNumber / 100 } })
					}
				/>
			</label>
			<label className="sc-layer-field sc-layer-range">
				<span>Vertical focus</span>
				<input
					type="range"
					min={0}
					max={100}
					value={Math.round(block.focalPoint.y * 100)}
					onChange={(event) =>
						onPatch({ focalPoint: { y: event.currentTarget.valueAsNumber / 100 } })
					}
				/>
			</label>
			{block.kind === "video" ? (
				<div className="sc-layer-grid">
					<label className="sc-layer-field">
						<span>Speed</span>
						<input
							type="number"
							min={0.25}
							max={4}
							step={0.25}
							value={block.playbackRate}
							onChange={(event) => finiteNumber(event, (playbackRate) => onPatch({ playbackRate }))}
						/>
					</label>
					<label className="sc-layer-field sc-layer-check">
						<span>Audio</span>
						<input
							type="checkbox"
							checked={!block.muted}
							onChange={(event) => onPatch({ muted: !event.currentTarget.checked })}
						/>
					</label>
				</div>
			) : null}
			{block.kind === "video" ? (
				<>
					<div className="sc-layer-grid">
						<SecondsField
							label="Source in"
							valueMs={block.trim.startMs}
							minMs={0}
							maxMs={block.trim.endMs - MIN_VIDEO_TRIM_MS}
							onCommit={(trimStartMs) => onPatch({ trimStartMs })}
						/>
						<SecondsField
							label="Source out"
							valueMs={block.trim.endMs}
							minMs={block.trim.startMs + MIN_VIDEO_TRIM_MS}
							maxMs={sourceDurationMs ?? block.trim.endMs}
							onCommit={(trimEndMs) => onPatch({ trimEndMs })}
						/>
					</div>
					<div className="sc-layer-audio-summary" data-testid="video-timing">
						<span aria-hidden="true" />
						<strong>{formatSeconds(block.trim.endMs - block.trim.startMs)} s clip</strong>
						<small>{videoTimingNote(block, sceneDurationMs)}</small>
					</div>
				</>
			) : null}
		</div>
	);
}

function StudioLayerCompositionControls({
	placement,
	onPlacement,
	onOrder,
	layerIndex,
	layerCount,
}: {
	placement: Readonly<BlockPlacement>;
	onPlacement: (patch: UpdateLayerPlacementPatch) => void;
	onOrder: (action: LayerOrderAction) => void;
	layerIndex: number;
	layerCount: number;
}) {
	const atBack = layerIndex <= 0;
	const atFront = layerIndex >= layerCount - 1;
	const controls = [
		{ key: "x", label: "X", value: placement.x },
		{ key: "y", label: "Y", value: placement.y },
		{ key: "width", label: "W", value: placement.width },
		{ key: "height", label: "H", value: placement.height },
	] as const;
	const order = [
		{ action: "back", label: "Send to back", disabled: atBack, icon: ArrowDownSquare },
		{ action: "backward", label: "Send backward", disabled: atBack, icon: ArrowDown },
		{ action: "forward", label: "Bring forward", disabled: atFront, icon: ArrowUp },
		{ action: "front", label: "Bring to front", disabled: atFront, icon: ArrowUpSquare },
	] as const;
	return (
		<section className="sc-layer-layout" aria-label="Layer layout">
			<header>
				<span>Layout</span>
				<div>
					{order.map(({ action, label, disabled, icon: Icon }) => (
						<StudioTooltip key={action} content={label}>
							<button
								type="button"
								aria-label={label}
								disabled={disabled}
								onClick={() => onOrder(action)}
							>
								<Icon size={12} aria-hidden="true" />
							</button>
						</StudioTooltip>
					))}
				</div>
			</header>
			<div className="sc-layer-presets">
				<button type="button" onClick={() => onPlacement({ x: 0, y: 0, width: 1, height: 1 })}>
					Fill
				</button>
				<button
					type="button"
					onClick={() => onPlacement({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 })}
				>
					Inset
				</button>
				<button
					type="button"
					onClick={() => onPlacement({ x: 0.08, y: 0.72, width: 0.84, height: 0.2 })}
				>
					Lower
				</button>
			</div>
			<div className="sc-layer-placement-grid">
				{controls.map((control) => (
					<label key={control.key}>
						<span>{control.label}</span>
						<input
							type="number"
							min={control.key === "width" || control.key === "height" ? 5 : 0}
							max={100}
							step={1}
							value={Math.round(control.value * 100)}
							aria-label={`${control.label} position percentage`}
							onChange={(event) =>
								finiteNumber(event, (value) => onPlacement({ [control.key]: value / 100 }))
							}
						/>
						<small>%</small>
					</label>
				))}
			</div>
		</section>
	);
}

function AudioLayerEditor({
	fileName,
	cue,
	sourceDurationMs,
	sourceAvailable,
	onPatch,
	onDelete,
}: {
	fileName: string;
	cue: ReturnType<typeof resolveAudioCue>["cue"];
	sourceDurationMs: number;
	sourceAvailable: boolean;
	onPatch: (patch: Parameters<typeof updateAudioCue>[2]) => void;
	onDelete: () => void;
}) {
	// Trim and fades share one budget: the trimmed clip must stay longer than
	// both fades together, or the cue invariant rejects the edit.
	const minimumClipMs = Math.max(1, cue.fadeInMs + cue.fadeOutMs);
	const patchGain = (percent: number) => {
		if (Number.isFinite(percent)) {
			onPatch({ gain: Math.min(Math.max(percent, 0), 100) / 100 });
		}
	};
	return (
		<div className="sc-layer-editor">
			<EditorHeader eyebrow="Audio cue" title={fileName} onDelete={onDelete} />
			<div className="sc-layer-audio-summary">
				<span aria-hidden="true" />
				<strong>{formatSeconds(cue.durationMs)} s clip</strong>
				{/* An image says "Media unavailable" on the stage; a silent cue has no
				    stage, so its missing bytes are named here instead. */}
				<small>
					{sourceAvailable
						? `${formatSeconds(sourceDurationMs)} s source`
						: "Source file is not in this browser"}
				</small>
			</div>
			<div className="sc-layer-grid">
				<SecondsField
					label="Timeline start"
					valueMs={cue.startMs}
					minMs={0}
					maxMs={Number.MAX_SAFE_INTEGER - cue.durationMs}
					onCommit={(startMs) => onPatch({ startMs })}
				/>
				<label className="sc-layer-field">
					<span>Volume</span>
					<input
						type="number"
						min={0}
						max={100}
						value={Math.round(cue.gain * 100)}
						onChange={(event) => patchGain(event.currentTarget.valueAsNumber)}
					/>
				</label>
				<SecondsField
					label="Source in"
					valueMs={cue.trim.startMs}
					minMs={0}
					maxMs={cue.trim.endMs - minimumClipMs}
					onCommit={(trimStartMs) => onPatch({ trimStartMs })}
				/>
				<SecondsField
					label="Source out"
					valueMs={cue.trim.endMs}
					minMs={cue.trim.startMs + minimumClipMs}
					maxMs={sourceDurationMs}
					onCommit={(trimEndMs) => onPatch({ trimEndMs })}
				/>
				<SecondsField
					label="Fade in"
					valueMs={cue.fadeInMs}
					minMs={0}
					maxMs={cue.durationMs - cue.fadeOutMs}
					onCommit={(fadeInMs) => onPatch({ fadeInMs })}
				/>
				<SecondsField
					label="Fade out"
					valueMs={cue.fadeOutMs}
					minMs={0}
					maxMs={cue.durationMs - cue.fadeInMs}
					onCommit={(fadeOutMs) => onPatch({ fadeOutMs })}
				/>
			</div>
			<label className="sc-layer-field sc-layer-range">
				<span>Volume</span>
				<input
					type="range"
					min={0}
					max={100}
					value={Math.round(cue.gain * 100)}
					onChange={(event) => patchGain(event.currentTarget.valueAsNumber)}
				/>
			</label>
		</div>
	);
}
