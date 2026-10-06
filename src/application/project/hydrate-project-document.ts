import { Asset } from "../../domain/entities/asset";
import { AudioCue } from "../../domain/entities/audio-cue";
import {
	type Block,
	CodeBlock,
	ImageBlock,
	TextBlock,
	VideoBlock,
} from "../../domain/entities/block";
import { Project } from "../../domain/entities/project";
import { Scene } from "../../domain/entities/scene";
import { holdableFocus } from "../focus/line-ranges";
import {
	type AssetMetadataPayload,
	type AudioCuePayload,
	type BlockPayload,
	type ProjectDocumentV2,
	parseProjectDocument,
} from "./project-document";

export interface HydratedProjectDocument {
	readonly project: Project;
	readonly settings: Readonly<ProjectDocumentV2["project"]["settings"]>;
	readonly legacySource?: Readonly<NonNullable<ProjectDocumentV2["project"]["legacySource"]>>;
}

function hydrateAudioCue(payload: AudioCuePayload): AudioCue {
	return AudioCue.create({
		id: payload.id,
		assetId: payload.assetId,
		startMs: payload.startMs,
		trim: payload.trim,
		gain: payload.gain,
		fadeInMs: payload.fadeInMs,
		fadeOutMs: payload.fadeOutMs,
	});
}

function hydrateAsset(payload: AssetMetadataPayload): Asset {
	switch (payload.kind) {
		case "image":
			return Asset.create(payload);
		case "video":
			return Asset.create(payload);
		case "audio":
			return Asset.create(payload);
	}
}

function baseBlockProps(payload: BlockPayload) {
	return {
		id: payload.id,
		placement: payload.placement,
		opacity: payload.opacity,
		...(payload.continuityKey ? { continuityKey: payload.continuityKey } : {}),
	};
}

function hydrateBlock(payload: BlockPayload): Block {
	switch (payload.kind) {
		case "code":
			return CodeBlock.create({
				...baseBlockProps(payload),
				code: payload.code,
				language: payload.language,
				themeName: payload.themeName,
				...(payload.fontFamily ? { fontFamily: payload.fontFamily } : {}),
				...(payload.borderRadius !== undefined ? { borderRadius: payload.borderRadius } : {}),
				// A file or a link may carry a focus the block cannot hold ("abc", "5-2"):
				// the project opens and the odd focus reads as the nearest one it can.
				...(payload.focus ? { focus: holdableFocus(payload.focus) } : {}),
				chrome: payload.chrome,
				showLineNumbers: payload.showLineNumbers,
				lineNumberStart: payload.lineNumberStart,
				framePadding: payload.framePadding,
				cardMargin: payload.cardMargin,
			});
		case "text":
			return TextBlock.create({
				...baseBlockProps(payload),
				text: payload.text,
				typography: payload.typography,
			});
		case "image":
			return ImageBlock.create({
				...baseBlockProps(payload),
				assetId: payload.assetId,
				fit: payload.fit,
				focalPoint: payload.focalPoint,
				...(payload.borderRadius !== undefined ? { borderRadius: payload.borderRadius } : {}),
			});
		case "video":
			return VideoBlock.create({
				...baseBlockProps(payload),
				assetId: payload.assetId,
				fit: payload.fit,
				focalPoint: payload.focalPoint,
				...(payload.borderRadius !== undefined ? { borderRadius: payload.borderRadius } : {}),
				trim: payload.trim,
				playbackRate: payload.playbackRate,
				muted: payload.muted,
			});
	}
}

/** Convert a validated V2 transport document into the immutable domain aggregate. */
export function hydrateProjectDocument(input: ProjectDocumentV2): HydratedProjectDocument {
	const parsed = parseProjectDocument(input);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Expected a V2 project document");
	}
	const { project: payload } = parsed.document;
	const project = Project.create({
		id: payload.id,
		title: payload.title,
		canvas: payload.canvas,
		assets: payload.assets.map(hydrateAsset),
		audioCues: payload.audioCues.map(hydrateAudioCue),
		scenes: payload.scenes.map((scene) =>
			Scene.create({
				id: scene.id,
				durationMs: scene.durationMs,
				blocks: scene.blocks.map(hydrateBlock),
				...(scene.caption !== undefined ? { caption: scene.caption } : {}),
				...(scene.transitionOut ? { transitionOut: scene.transitionOut } : {}),
			}),
		),
	});
	const settings = Object.freeze({ ...payload.settings });
	const legacySource = payload.legacySource
		? Object.freeze({ ...payload.legacySource })
		: undefined;
	return Object.freeze({
		project,
		settings,
		...(legacySource ? { legacySource } : {}),
	});
}
