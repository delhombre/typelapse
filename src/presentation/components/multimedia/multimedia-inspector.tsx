import {
	type UpdateCodeLayerPatch,
	type UpdateMediaLayerPatch,
	type UpdateTextLayerPatch,
	reorderLayer,
	updateCodeLayer,
	updateLayerPlacement,
	updateMediaLayer,
	updateTextLayer,
} from "@/application/project/multimedia-authoring";
import type { Project } from "@/domain/entities/project";
import {
	LayerOrderControls,
	LayerPlacementControls,
} from "@/presentation/components/multimedia/layer-composition-controls";
import { StudioTooltip, StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { Trash, X } from "reicon-react";
import "./multimedia-inspector.css";

export interface MultimediaInspectorProps {
	readonly project: Project;
	readonly sceneId: string;
	readonly blockId: string | null;
	readonly onTransact: (edit: (project: Project) => Project) => void;
	readonly onClose: () => void;
}

function labelFor(kind: "code" | "text" | "image" | "video"): string {
	if (kind === "image") return "Image";
	if (kind === "video") return "Video";
	if (kind === "code") return "Code";
	return "Text";
}

export function MultimediaInspector({
	project,
	sceneId,
	blockId,
	onTransact,
	onClose,
}: MultimediaInspectorProps) {
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	const block = scene?.blocks.find((candidate) => candidate.id === blockId) ?? null;
	if (!scene) return null;

	const patchText = (patch: UpdateTextLayerPatch) => {
		if (!block || block.kind !== "text") return;
		onTransact((current) => updateTextLayer(current, sceneId, block.id, patch));
	};
	const patchCode = (patch: UpdateCodeLayerPatch) => {
		if (!block || block.kind !== "code") return;
		onTransact((current) => updateCodeLayer(current, sceneId, block.id, patch));
	};
	const patchMedia = (patch: UpdateMediaLayerPatch) => {
		if (!block || (block.kind !== "image" && block.kind !== "video")) return;
		onTransact((current) => updateMediaLayer(current, sceneId, block.id, patch));
	};
	const blockCount = project.scenes.reduce(
		(count, candidate) => count + candidate.blocks.length,
		0,
	);
	const canDeleteBlock = block !== null && (blockCount > 1 || project.audioCues.length > 0);
	const blockIndex = block ? scene.blocks.findIndex((candidate) => candidate.id === block.id) : -1;

	return (
		<section
			className="mm-inspector"
			aria-label={block ? `${labelFor(block.kind)} properties` : "Scene properties"}
		>
			<header className="mm-inspector-head">
				<div>
					<p className="mm-eyebrow">{block ? "Layer" : "Scene"}</p>
					<h2>{block ? labelFor(block.kind) : `Scene ${project.scenes.indexOf(scene) + 1}`}</h2>
				</div>
				<StudioTooltipProvider>
					<div className="mm-inspector-actions">
						{block ? (
							<StudioTooltip content="Delete layer" side="left">
								<button
									type="button"
									className="mm-icon-button mm-danger"
									aria-label="Delete layer"
									disabled={!canDeleteBlock}
									onClick={() => {
										onTransact((current) => current.removeBlock(sceneId, block.id));
										onClose();
									}}
								>
									<Trash size={17} aria-hidden="true" />
								</button>
							</StudioTooltip>
						) : null}
						<StudioTooltip content="Close properties" side="left">
							<button
								type="button"
								className="mm-icon-button"
								aria-label="Close properties"
								onClick={onClose}
							>
								<X size={17} aria-hidden="true" />
							</button>
						</StudioTooltip>
					</div>
				</StudioTooltipProvider>
			</header>

			<div className="mm-inspector-body">
				{block ? (
					<>
						<LayerPlacementControls
							placement={block.placement}
							onPatch={(patch) =>
								onTransact((current) => updateLayerPlacement(current, sceneId, block.id, patch))
							}
						/>
						<LayerOrderControls
							index={blockIndex}
							count={scene.blocks.length}
							onOrder={(action) =>
								onTransact((current) => reorderLayer(current, sceneId, block.id, action))
							}
						/>
					</>
				) : null}

				{block?.kind === "text" ? (
					<>
						<label className="mm-field mm-field-wide">
							<span>Content</span>
							<textarea
								value={block.text}
								rows={4}
								onChange={(event) => patchText({ text: event.currentTarget.value })}
							/>
						</label>
						<label className="mm-field">
							<span>Size</span>
							<input
								type="number"
								min={12}
								max={320}
								value={block.typography.fontSize}
								onChange={(event) => patchText({ fontSize: Number(event.currentTarget.value) })}
							/>
						</label>
						<fieldset className="mm-field mm-field-wide">
							<legend>Alignment</legend>
							<div className="mm-segmented">
								{(["left", "center", "right"] as const).map((align) => (
									<button
										type="button"
										key={align}
										aria-pressed={block.typography.align === align}
										onClick={() => patchText({ align })}
									>
										{align[0]?.toUpperCase()}
										{align.slice(1)}
									</button>
								))}
							</div>
						</fieldset>
					</>
				) : null}

				{block?.kind === "code" ? (
					<>
						<label className="mm-field mm-field-wide">
							<span>Code</span>
							<textarea
								className="mm-code-input"
								value={block.code}
								rows={7}
								spellCheck={false}
								onChange={(event) => patchCode({ code: event.currentTarget.value })}
							/>
						</label>
						<label className="mm-field">
							<span>Language</span>
							<input
								value={block.language}
								onChange={(event) => patchCode({ language: event.currentTarget.value })}
							/>
						</label>
						<label className="mm-switch-row">
							<span>Line numbers</span>
							<input
								type="checkbox"
								checked={block.showLineNumbers}
								onChange={(event) => patchCode({ showLineNumbers: event.currentTarget.checked })}
							/>
						</label>
					</>
				) : null}

				{block && (block.kind === "image" || block.kind === "video") ? (
					<>
						<fieldset className="mm-control-section mm-field-wide">
							<legend>Media crop</legend>
							<div className="mm-segmented">
								{(["cover", "contain"] as const).map((fit) => (
									<button
										type="button"
										key={fit}
										aria-pressed={block.fit === fit}
										onClick={() => patchMedia({ fit })}
									>
										{fit === "cover" ? "Fill" : "Fit"}
									</button>
								))}
							</div>
							<div className="mm-media-number-grid">
								<label className="mm-mini-field">
									<span>Focal X</span>
									<input
										type="number"
										aria-label="Focal point X (%)"
										min={0}
										max={100}
										step={1}
										value={Math.round(block.focalPoint.x * 100)}
										onChange={(event) =>
											patchMedia({
												focalPoint: { x: Number(event.currentTarget.value) / 100 },
											})
										}
									/>
								</label>
								<label className="mm-mini-field">
									<span>Focal Y</span>
									<input
										type="number"
										aria-label="Focal point Y (%)"
										min={0}
										max={100}
										step={1}
										value={Math.round(block.focalPoint.y * 100)}
										onChange={(event) =>
											patchMedia({
												focalPoint: { y: Number(event.currentTarget.value) / 100 },
											})
										}
									/>
								</label>
							</div>
						</fieldset>
						<label className="mm-field mm-field-wide">
							<span>Corner radius</span>
							<div className="mm-input-suffix">
								<input
									type="number"
									aria-label="Corner radius (px)"
									min={0}
									max={160}
									step={1}
									value={block.borderRadius}
									onChange={(event) =>
										patchMedia({ borderRadius: Number(event.currentTarget.value) })
									}
								/>
								<span>px</span>
							</div>
						</label>
						<label className="mm-field mm-field-wide">
							<span>Opacity · {Math.round(block.opacity * 100)}%</span>
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={block.opacity}
								onChange={(event) => patchMedia({ opacity: Number(event.currentTarget.value) })}
							/>
						</label>
						{block.kind === "video" ? (
							<>
								<fieldset className="mm-control-section mm-field-wide">
									<legend>Clip timing</legend>
									<div className="mm-clip-timing-grid">
										<label className="mm-mini-field">
											<span>Start</span>
											<input
												type="number"
												aria-label="Trim start (s)"
												min={0}
												step={0.1}
												value={block.trim.startMs / 1_000}
												onChange={(event) =>
													patchMedia({
														trimStartMs: Math.round(Number(event.currentTarget.value) * 1_000),
													})
												}
											/>
										</label>
										<label className="mm-mini-field">
											<span>End</span>
											<input
												type="number"
												aria-label="Trim end (s)"
												min={0.1}
												step={0.1}
												value={block.trim.endMs / 1_000}
												onChange={(event) =>
													patchMedia({
														trimEndMs: Math.round(Number(event.currentTarget.value) * 1_000),
													})
												}
											/>
										</label>
										<label className="mm-mini-field mm-field-wide">
											<span>Speed</span>
											<select
												aria-label="Playback speed"
												value={block.playbackRate}
												onChange={(event) =>
													patchMedia({ playbackRate: Number(event.currentTarget.value) })
												}
											>
												{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((rate) => (
													<option key={rate} value={rate}>
														{rate}×
													</option>
												))}
											</select>
										</label>
									</div>
								</fieldset>
								<label className="mm-switch-row">
									<span>Mute clip</span>
									<input
										type="checkbox"
										checked={block.muted}
										onChange={(event) => patchMedia({ muted: event.currentTarget.checked })}
									/>
								</label>
							</>
						) : null}
					</>
				) : null}

				{!block ? (
					<>
						<label className="mm-field">
							<span>Duration</span>
							<div className="mm-input-suffix">
								<input
									type="number"
									min={0.2}
									max={120}
									step={0.1}
									value={scene.durationMs / 1_000}
									onChange={(event) => {
										const durationMs = Math.round(Number(event.currentTarget.value) * 1_000);
										onTransact((current) => current.replaceScene(scene.withDuration(durationMs)));
									}}
								/>
								<span>s</span>
							</div>
						</label>
						<fieldset className="mm-field mm-field-wide">
							<legend>Transition</legend>
							<div className="mm-segmented">
								{(["cut", "crossfade", "magic-move"] as const).map((kind) => (
									<button
										type="button"
										key={kind}
										aria-pressed={(scene.transitionOut?.kind ?? "cut") === kind}
										onClick={() =>
											onTransact((current) =>
												current.replaceScene(
													scene.withTransition({
														kind,
														durationMs: kind === "cut" ? 0 : 450,
													}),
												),
											)
										}
									>
										{kind === "magic-move" ? "Morph" : kind[0]?.toUpperCase() + kind.slice(1)}
									</button>
								))}
							</div>
						</fieldset>
					</>
				) : null}
			</div>
		</section>
	);
}
