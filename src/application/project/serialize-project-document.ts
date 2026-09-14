import type { Block } from "../../domain/entities/block";
import type { HydratedProjectDocument } from "./hydrate-project-document";
import type { AssetMetadataPayload, BlockPayload, ProjectDocumentV2 } from "./project-document";
import { parseProjectDocument } from "./project-document";

function serializeAsset(
	asset: HydratedProjectDocument["project"]["assets"][number],
): AssetMetadataPayload {
	return { id: asset.id, ...asset.metadata };
}

function baseBlock(block: Block) {
	return {
		id: block.id,
		opacity: block.opacity,
		placement: { ...block.placement },
		...(block.continuityKey ? { continuityKey: block.continuityKey } : {}),
	};
}

function serializeBlock(block: Block): BlockPayload {
	switch (block.kind) {
		case "code":
			return {
				...baseBlock(block),
				kind: block.kind,
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
			};
		case "text":
			return {
				...baseBlock(block),
				kind: block.kind,
				text: block.text,
				typography: { ...block.typography },
			};
		case "image":
			return {
				...baseBlock(block),
				kind: block.kind,
				assetId: block.assetId,
				fit: block.fit,
				focalPoint: { ...block.focalPoint },
				...(block.borderRadius > 0 ? { borderRadius: block.borderRadius } : {}),
			};
		case "video":
			return {
				...baseBlock(block),
				kind: block.kind,
				assetId: block.assetId,
				fit: block.fit,
				focalPoint: { ...block.focalPoint },
				...(block.borderRadius > 0 ? { borderRadius: block.borderRadius } : {}),
				trim: { ...block.trim },
				playbackRate: block.playbackRate,
				muted: block.muted,
			};
	}
}

/** Serialize the immutable authoring aggregate into the sole hosted wire contract. */
export function serializeProjectDocument(input: HydratedProjectDocument): ProjectDocumentV2 {
	const document: ProjectDocumentV2 = {
		schemaVersion: 2,
		project: {
			id: input.project.id,
			title: input.project.title,
			canvas: { ...input.project.canvas },
			settings: { ...input.settings },
			assets: input.project.assets.map(serializeAsset),
			audioCues: input.project.audioCues.map((cue) => ({
				id: cue.id,
				assetId: cue.assetId,
				startMs: cue.startMs,
				trim: { ...cue.trim },
				gain: cue.gain,
				fadeInMs: cue.fadeInMs,
				fadeOutMs: cue.fadeOutMs,
			})),
			scenes: input.project.scenes.map((scene) => ({
				id: scene.id,
				durationMs: scene.durationMs,
				blocks: scene.blocks.map(serializeBlock),
				...(scene.caption ? { caption: scene.caption } : {}),
				...(scene.transitionOut ? { transitionOut: { ...scene.transitionOut } } : {}),
			})),
			...(input.legacySource ? { legacySource: { ...input.legacySource } } : {}),
		},
	};
	const parsed = parseProjectDocument(document);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Expected a V2 project document");
	}
	return parsed.document;
}
