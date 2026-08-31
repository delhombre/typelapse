import {
	deleteAudioCue,
	selectAudioCue as resolveAudioCue,
	updateAudioCue,
} from "@/application/project/audio-cue-authoring";
import {
	type LayerOrderAction,
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
import { type ChangeEvent, useEffect, useState } from "react";
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
		return (
			<AudioLayerEditor
				fileName={audioSelection.asset.metadata.fileName}
				cue={audioSelection.cue}
				sourceDurationMs={audioSelection.asset.metadata.durationMs}
				onPatch={(patch) =>
					composition.transact((project) => updateAudioCue(project, selectedAudioCueId, patch))
				}
				onDelete={() => {
					composition.transact((project) => deleteAudioCue(project, selectedAudioCueId));
					selectAuthoredAudio(null);
					feedback("commit");
				}}
			/>
		);
	}

	if (!scene || !block || block.kind === "code") {
		return <CodeEditor />;
	}
	if (block.kind === "text") {
		const blockIndex = scene.blocks.findIndex((candidate) => candidate.id === block.id);
		return (
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
			/>
		);
	}
	const asset = composition.value.project.assets.find(
		(candidate) => candidate.id === block.assetId,
	);
	return (
		<MediaLayerEditor
			block={block}
			fileName={asset?.metadata.fileName ?? "Media"}
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
		/>
	);
}

function finiteNumber(event: ChangeEvent<HTMLInputElement>, apply: (value: number) => void) {
	const value = event.currentTarget.valueAsNumber;
	if (Number.isFinite(value)) {
		apply(value);
	}
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
	onPatch,
	onDelete,
	onPlacement,
	onOrder,
	layerIndex,
	layerCount,
}: {
	block: ImageBlock | VideoBlock;
	fileName: string;
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
	onPatch,
	onDelete,
}: {
	fileName: string;
	cue: ReturnType<typeof resolveAudioCue>["cue"];
	sourceDurationMs: number;
	onPatch: (patch: Parameters<typeof updateAudioCue>[2]) => void;
	onDelete: () => void;
}) {
	return (
		<div className="sc-layer-editor">
			<EditorHeader eyebrow="Audio cue" title={fileName} onDelete={onDelete} />
			<div className="sc-layer-audio-summary">
				<span aria-hidden="true" />
				<strong>{(cue.durationMs / 1000).toFixed(1)} s clip</strong>
				<small>{(sourceDurationMs / 1000).toFixed(1)} s source</small>
			</div>
			<div className="sc-layer-grid">
				<label className="sc-layer-field">
					<span>Timeline start</span>
					<input
						type="number"
						min={0}
						step={0.1}
						value={cue.startMs / 1000}
						onChange={(event) =>
							onPatch({ startMs: Math.round(event.currentTarget.valueAsNumber * 1000) })
						}
					/>
				</label>
				<label className="sc-layer-field">
					<span>Volume</span>
					<input
						type="number"
						min={0}
						max={100}
						value={Math.round(cue.gain * 100)}
						onChange={(event) => onPatch({ gain: event.currentTarget.valueAsNumber / 100 })}
					/>
				</label>
			</div>
			<label className="sc-layer-field sc-layer-range">
				<span>Volume</span>
				<input
					type="range"
					min={0}
					max={100}
					value={Math.round(cue.gain * 100)}
					onChange={(event) => onPatch({ gain: event.currentTarget.valueAsNumber / 100 })}
				/>
			</label>
		</div>
	);
}
