import type { Asset } from "../../domain/entities/asset";
import { AudioCue } from "../../domain/entities/audio-cue";
import {
	type Block,
	type BlockPlacement,
	CodeBlock,
	type CodeWindowChrome,
	ImageBlock,
	MAX_MEDIA_BORDER_RADIUS,
	type MediaFit,
	type MediaFocalPoint,
	type TextAlignment,
	TextBlock,
	VideoBlock,
} from "../../domain/entities/block";
import type { Project } from "../../domain/entities/project";
import { Scene } from "../../domain/entities/scene";
import type { ProjectDocumentV2 } from "./project-document";

const DEFAULT_TEXT_PLACEMENT: BlockPlacement = { x: 0.12, y: 0.2, width: 0.76, height: 0.3 };
const DEFAULT_CODE_PLACEMENT: BlockPlacement = { x: 0.12, y: 0.18, width: 0.76, height: 0.64 };
const DEFAULT_MEDIA_PLACEMENT: BlockPlacement = { x: 0, y: 0, width: 1, height: 1 };
const MIN_LAYER_SIZE = 0.05;
export const MIN_VIDEO_TRIM_MS = 100;
const MIN_VIDEO_PLAYBACK_RATE = 0.25;
const MAX_VIDEO_PLAYBACK_RATE = 4;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, message: string): number {
	if (!Number.isFinite(value)) {
		throw new Error(message);
	}
	return value;
}

export function addEmptyScene(
	project: Project,
	options: { readonly id?: string; readonly durationMs?: number } = {},
): Project {
	return project.addScene(
		Scene.create({
			...(options.id ? { id: options.id } : {}),
			durationMs: options.durationMs ?? 3_200,
			blocks: [],
		}),
	);
}

interface TextLayerOptions {
	readonly id?: string;
	readonly text?: string;
	readonly placement?: BlockPlacement;
}

/** The text layer "Add text" creates, also the title a bare blank scene starts with. */
export function newTextLayer(options: TextLayerOptions = {}): TextBlock {
	return TextBlock.create({
		...(options.id ? { id: options.id } : {}),
		text: options.text ?? "Add your text",
		placement: options.placement ?? DEFAULT_TEXT_PLACEMENT,
		typography: {
			fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
			fontSize: 88,
			fontWeight: 650,
			color: "#fffaf0",
			align: "center",
		},
	});
}

export function addTextLayer(
	project: Project,
	sceneId: string,
	options: TextLayerOptions = {},
): Project {
	return project.addBlock(sceneId, newTextLayer(options));
}

export function addCodeLayer(
	project: Project,
	sceneId: string,
	options: {
		readonly id?: string;
		readonly code?: string;
		readonly language?: string;
		readonly placement?: BlockPlacement;
	} = {},
): Project {
	return project.addBlock(
		sceneId,
		CodeBlock.create({
			...(options.id ? { id: options.id } : {}),
			code: options.code ?? "const story = createSomethingRemarkable();",
			language: options.language ?? "typescript",
			placement: options.placement ?? DEFAULT_CODE_PLACEMENT,
			themeName: "midnight",
			chrome: "macos",
			showLineNumbers: true,
			lineNumberStart: 1,
			framePadding: 28,
			cardMargin: 32,
		}),
	);
}

export interface AddMediaAssetOptions {
	readonly blockId?: string;
	readonly cueId?: string;
	readonly startMs?: number;
	readonly placement?: BlockPlacement;
}

/** Register imported bytes once, then place their typed representation. */
export function addMediaAsset(
	project: Project,
	sceneId: string,
	asset: Asset,
	options: AddMediaAssetOptions = {},
): Project {
	if (project.assets.some((candidate) => candidate.id === asset.id)) {
		throw new Error(`Asset ${asset.id} is already registered`);
	}
	return placeMediaAsset(project.registerAsset(asset), sceneId, asset, options);
}

/** Every asset a layer or an audio cue of this document points at. */
export function referencedAssetIds(document: ProjectDocumentV2): Set<string> {
	const ids = new Set(document.project.audioCues.map((cue) => cue.assetId));
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "image" || block.kind === "video") {
				ids.add(block.assetId);
			}
		}
	}
	return ids;
}

/**
 * The document without the assets nothing references any more: what a deleted
 * layer or cue leaves behind once no undo can bring it back (a restore, where
 * history is empty). The same document comes back when there is nothing to drop.
 */
export function pruneUnreferencedAssets(document: ProjectDocumentV2): ProjectDocumentV2 {
	const referenced = referencedAssetIds(document);
	const assets = document.project.assets.filter((asset) => referenced.has(asset.id));
	return assets.length === document.project.assets.length
		? document
		: { ...document, project: { ...document.project, assets } };
}

/** Place canonical metadata that was already registered by a hosted upload. */
export function placeRegisteredMediaAsset(
	project: Project,
	sceneId: string,
	assetId: string,
	options: AddMediaAssetOptions = {},
): Project {
	const asset = project.assets.find((candidate) => candidate.id === assetId);
	if (!asset) {
		throw new Error(`Asset ${assetId} is not registered`);
	}
	return placeMediaAsset(project, sceneId, asset, options);
}

function placeMediaAsset(
	project: Project,
	sceneId: string,
	asset: Asset,
	options: AddMediaAssetOptions,
): Project {
	if (asset.metadata.kind === "audio") {
		return project.addAudioCue(
			AudioCue.create({
				...(options.cueId ? { id: options.cueId } : {}),
				assetId: asset.id,
				startMs: options.startMs ?? 0,
				trim: { startMs: 0, endMs: asset.metadata.durationMs },
			}),
		);
	}
	if (asset.metadata.kind === "image") {
		return addVisualMediaBehindOverlays(
			project,
			sceneId,
			ImageBlock.create({
				...(options.blockId ? { id: options.blockId } : {}),
				assetId: asset.id,
				placement: options.placement ?? DEFAULT_MEDIA_PLACEMENT,
				fit: "cover",
			}),
		);
	}
	return addVisualMediaBehindOverlays(
		project,
		sceneId,
		VideoBlock.create({
			...(options.blockId ? { id: options.blockId } : {}),
			assetId: asset.id,
			placement: options.placement ?? DEFAULT_MEDIA_PLACEMENT,
			fit: "cover",
			trim: { startMs: 0, endMs: asset.metadata.durationMs },
			muted: true,
		}),
	);
}

/**
 * Scene blocks are painted back-to-front. Imported media therefore enters
 * immediately below the first text/code overlay instead of covering the
 * story the user already composed.
 */
function addVisualMediaBehindOverlays(
	project: Project,
	sceneId: string,
	block: ImageBlock | VideoBlock,
): Project {
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) {
		throw new Error(`Scene ${sceneId} does not belong to project`);
	}
	const firstOverlayIndex = scene.blocks.findIndex(
		(candidate) => candidate.kind === "text" || candidate.kind === "code",
	);
	const insertionIndex = firstOverlayIndex < 0 ? scene.blocks.length : firstOverlayIndex;
	return project.addBlock(sceneId, block, insertionIndex);
}

function selectedBlock(project: Project, sceneId: string, blockId: string): Block {
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) {
		throw new Error(`Scene ${sceneId} does not belong to project`);
	}
	const block = scene.blocks.find((candidate) => candidate.id === blockId);
	if (!block) {
		throw new Error(`Block ${blockId} does not belong to scene ${sceneId}`);
	}
	return block;
}

function sharedBlockProps(
	block: Block,
	opacity: number | undefined,
	placement: BlockPlacement = block.placement,
) {
	return {
		id: block.id,
		placement,
		opacity: opacity ?? block.opacity,
		...(block.continuityKey ? { continuityKey: block.continuityKey } : {}),
	};
}

export interface UpdateTextLayerPatch {
	readonly text?: string;
	readonly fontFamily?: string;
	readonly fontSize?: number;
	readonly fontWeight?: number;
	readonly color?: string;
	readonly align?: TextAlignment;
	readonly opacity?: number;
}

export function updateTextLayer(
	project: Project,
	sceneId: string,
	blockId: string,
	patch: UpdateTextLayerPatch,
): Project {
	const block = selectedBlock(project, sceneId, blockId);
	if (block.kind !== "text") {
		throw new Error(`Block ${blockId} is not a text layer`);
	}
	return project.replaceBlock(
		sceneId,
		TextBlock.create({
			...sharedBlockProps(block, patch.opacity),
			text: patch.text ?? block.text,
			typography: {
				fontFamily: patch.fontFamily ?? block.typography.fontFamily,
				fontSize: patch.fontSize ?? block.typography.fontSize,
				fontWeight: patch.fontWeight ?? block.typography.fontWeight,
				color: patch.color ?? block.typography.color,
				align: patch.align ?? block.typography.align,
			},
		}),
	);
}

export interface UpdateCodeLayerPatch {
	readonly code?: string;
	readonly language?: string;
	readonly themeName?: string;
	readonly fontFamily?: string;
	readonly borderRadius?: number;
	readonly focus?: string;
	readonly chrome?: CodeWindowChrome;
	readonly showLineNumbers?: boolean;
	readonly lineNumberStart?: number;
	readonly framePadding?: number;
	readonly cardMargin?: number;
	readonly opacity?: number;
}

export function updateCodeLayer(
	project: Project,
	sceneId: string,
	blockId: string,
	patch: UpdateCodeLayerPatch,
): Project {
	const block = selectedBlock(project, sceneId, blockId);
	if (block.kind !== "code") {
		throw new Error(`Block ${blockId} is not a code layer`);
	}
	return project.replaceBlock(
		sceneId,
		CodeBlock.create({
			...sharedBlockProps(block, patch.opacity),
			code: patch.code ?? block.code,
			language: patch.language ?? block.language,
			themeName: patch.themeName ?? block.themeName,
			fontFamily: patch.fontFamily ?? block.fontFamily,
			borderRadius: patch.borderRadius ?? block.borderRadius,
			...(patch.focus !== undefined
				? { focus: patch.focus }
				: block.focus
					? { focus: block.focus }
					: {}),
			chrome: patch.chrome ?? block.chrome,
			showLineNumbers: patch.showLineNumbers ?? block.showLineNumbers,
			lineNumberStart: patch.lineNumberStart ?? block.lineNumberStart,
			framePadding: patch.framePadding ?? block.framePadding,
			cardMargin: patch.cardMargin ?? block.cardMargin,
		}),
	);
}

export interface UpdateMediaLayerPatch {
	readonly fit?: MediaFit;
	readonly opacity?: number;
	readonly muted?: boolean;
	readonly focalPoint?: Partial<MediaFocalPoint>;
	readonly borderRadius?: number;
	readonly trimStartMs?: number;
	readonly trimEndMs?: number;
	readonly playbackRate?: number;
}

function normalizedFocalPoint(
	current: Readonly<MediaFocalPoint>,
	patch: Partial<MediaFocalPoint> | undefined,
): MediaFocalPoint {
	if (!patch) {
		return current;
	}
	return {
		x: clamp(finite(patch.x ?? current.x, "Media focal point values must be finite"), 0, 1),
		y: clamp(finite(patch.y ?? current.y, "Media focal point values must be finite"), 0, 1),
	};
}

function normalizedMediaBorderRadius(current: number, requested: number | undefined): number {
	if (requested === undefined) {
		return current;
	}
	return clamp(finite(requested, "Media border radius must be finite"), 0, MAX_MEDIA_BORDER_RADIUS);
}

export function updateMediaLayer(
	project: Project,
	sceneId: string,
	blockId: string,
	patch: UpdateMediaLayerPatch,
): Project {
	const block = selectedBlock(project, sceneId, blockId);
	if (block.kind === "image") {
		const focalPoint = normalizedFocalPoint(block.focalPoint, patch.focalPoint);
		const borderRadius = normalizedMediaBorderRadius(block.borderRadius, patch.borderRadius);
		return project.replaceBlock(
			sceneId,
			ImageBlock.create({
				...sharedBlockProps(block, patch.opacity),
				assetId: block.assetId,
				fit: patch.fit ?? block.fit,
				focalPoint,
				borderRadius,
			}),
		);
	}
	if (block.kind === "video") {
		const asset = project.assets.find((candidate) => candidate.id === block.assetId);
		if (!asset || asset.metadata.kind !== "video") {
			throw new Error(`Video block ${blockId} references a missing video asset`);
		}
		const requestedStart = finite(
			patch.trimStartMs ?? block.trim.startMs,
			"Video trim values must be finite",
		);
		const startMs = Math.round(
			clamp(requestedStart, 0, Math.max(0, asset.metadata.durationMs - MIN_VIDEO_TRIM_MS)),
		);
		const requestedEnd = finite(
			patch.trimEndMs ?? block.trim.endMs,
			"Video trim values must be finite",
		);
		const endMs = Math.round(
			clamp(requestedEnd, startMs + MIN_VIDEO_TRIM_MS, asset.metadata.durationMs),
		);
		const focalPoint = normalizedFocalPoint(block.focalPoint, patch.focalPoint);
		const borderRadius = normalizedMediaBorderRadius(block.borderRadius, patch.borderRadius);
		const playbackRate =
			patch.playbackRate === undefined
				? block.playbackRate
				: clamp(
						finite(patch.playbackRate, "Video playback rate must be finite"),
						MIN_VIDEO_PLAYBACK_RATE,
						MAX_VIDEO_PLAYBACK_RATE,
					);
		return project.replaceBlock(
			sceneId,
			VideoBlock.create({
				...sharedBlockProps(block, patch.opacity),
				assetId: block.assetId,
				fit: patch.fit ?? block.fit,
				focalPoint,
				borderRadius,
				trim: { startMs, endMs },
				playbackRate,
				muted: patch.muted ?? block.muted,
			}),
		);
	}
	throw new Error(`Block ${blockId} is not a media layer`);
}

export interface UpdateLayerPlacementPatch {
	readonly x?: number;
	readonly y?: number;
	readonly width?: number;
	readonly height?: number;
}

function normalizedPlacement(
	current: Readonly<BlockPlacement>,
	patch: UpdateLayerPlacementPatch,
): BlockPlacement {
	for (const value of Object.values(patch)) {
		if (value !== undefined && !Number.isFinite(value)) {
			throw new Error("Layer placement values must be finite");
		}
	}
	const width = clamp(patch.width ?? current.width, MIN_LAYER_SIZE, 1);
	const height = clamp(patch.height ?? current.height, MIN_LAYER_SIZE, 1);
	return {
		x: clamp(patch.x ?? current.x, 0, 1 - width),
		y: clamp(patch.y ?? current.y, 0, 1 - height),
		width,
		height,
	};
}

/** Patch geometry for any visual layer while preserving its typed settings. */
export function updateLayerPlacement(
	project: Project,
	sceneId: string,
	blockId: string,
	patch: UpdateLayerPlacementPatch,
): Project {
	const block = selectedBlock(project, sceneId, blockId);
	const placement = normalizedPlacement(block.placement, patch);
	if (block.kind === "text") {
		return project.replaceBlock(
			sceneId,
			TextBlock.create({
				...sharedBlockProps(block, undefined, placement),
				text: block.text,
				typography: block.typography,
			}),
		);
	}
	if (block.kind === "code") {
		return project.replaceBlock(
			sceneId,
			CodeBlock.create({
				...sharedBlockProps(block, undefined, placement),
				code: block.code,
				language: block.language,
				themeName: block.themeName,
				fontFamily: block.fontFamily,
				borderRadius: block.borderRadius,
				...(block.focus ? { focus: block.focus } : {}),
				chrome: block.chrome,
				showLineNumbers: block.showLineNumbers,
				lineNumberStart: block.lineNumberStart,
				framePadding: block.framePadding,
				cardMargin: block.cardMargin,
			}),
		);
	}
	if (block.kind === "image") {
		return project.replaceBlock(
			sceneId,
			ImageBlock.create({
				...sharedBlockProps(block, undefined, placement),
				assetId: block.assetId,
				fit: block.fit,
				focalPoint: block.focalPoint,
				borderRadius: block.borderRadius,
			}),
		);
	}
	return project.replaceBlock(
		sceneId,
		VideoBlock.create({
			...sharedBlockProps(block, undefined, placement),
			assetId: block.assetId,
			fit: block.fit,
			focalPoint: block.focalPoint,
			borderRadius: block.borderRadius,
			trim: block.trim,
			playbackRate: block.playbackRate,
			muted: block.muted,
		}),
	);
}

export type LayerOrderAction = "forward" | "backward" | "front" | "back";

/** Scene order is back-to-front; boundary actions are intentional no-ops. */
export function reorderLayer(
	project: Project,
	sceneId: string,
	blockId: string,
	action: LayerOrderAction,
): Project {
	selectedBlock(project, sceneId, blockId);
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) {
		throw new Error(`Scene ${sceneId} does not belong to project`);
	}
	const ids = scene.blocks.map((block) => block.id);
	const currentIndex = ids.indexOf(blockId);
	let targetIndex = currentIndex;
	if (action === "forward") {
		targetIndex = Math.min(ids.length - 1, currentIndex + 1);
	} else if (action === "backward") {
		targetIndex = Math.max(0, currentIndex - 1);
	} else if (action === "front") {
		targetIndex = ids.length - 1;
	} else {
		targetIndex = 0;
	}
	if (targetIndex === currentIndex) {
		return project;
	}
	ids.splice(currentIndex, 1);
	ids.splice(targetIndex, 0, blockId);
	return project.reorderBlocks(sceneId, ids);
}
