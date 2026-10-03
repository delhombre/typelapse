import type { ProjectDocumentV2 } from "../project/project-document";

/** The continuity key the studio gives each scene's own code card. */
export const PRIMARY_CODE_CONTINUITY_KEY = "primary-code";

export type CompositionSlot = "under-code" | "over-code";

/**
 * Whether a scene carries the studio's code card. A blank scene (a title card)
 * does not, and no renderer draws a card on it.
 */
export function hasCodeCard(scene: {
	readonly blocks: readonly { readonly kind: string; readonly continuityKey?: string }[];
}): boolean {
	return scene.blocks.some(
		(block) => block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY,
	);
}

/**
 * Which side of the studio's code card a layer is painted on.
 *
 * The card is not drawn from its block's placement: the preview and the painter
 * centre it with the shared card fit and morph it with magic move. So a scene's
 * other layers split around it by their order in the scene, those authored
 * before the card under it and every other one over it. One rule, read by the
 * preview's layer surfaces and by the painter.
 */
export function compositionSlot(
	document: ProjectDocumentV2,
	layer: { readonly sceneId: string; readonly blockId: string },
): CompositionSlot {
	const scene = document.project.scenes.find((candidate) => candidate.id === layer.sceneId);
	if (!scene) {
		return "over-code";
	}
	const layerIndex = scene.blocks.findIndex((block) => block.id === layer.blockId);
	const codeIndex = scene.blocks.findIndex(
		(block) => block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY,
	);
	return codeIndex >= 0 && layerIndex < codeIndex ? "under-code" : "over-code";
}

/**
 * How visible the studio's code card is in one compiled frame.
 *
 * Each scene's card fades with its scene, so through a transition this is the
 * crossfade of the two scenes' own card opacities, as every other layer gets
 * it. The preview used to read the current step's opacity instead, which made
 * a card hidden on a title card pop in at a step boundary while the painter
 * faded it. A blank scene contributes no card, so a frame of blank scenes
 * hides it; only a frame with no scene at all (nothing to hide it) shows it.
 *
 * Pure, for every renderer to call: the server composition draws each code
 * layer itself, which already puts no card on a blank scene.
 */
export function primaryCodeOpacity(frame: {
	readonly scenes: readonly unknown[];
	readonly layers: readonly {
		readonly kind: string;
		readonly opacity: number;
		readonly continuityKey?: string;
	}[];
}): number {
	if (frame.scenes.length === 0) {
		return 1;
	}
	let opacity = 0;
	for (const layer of frame.layers) {
		if (layer.kind === "code" && layer.continuityKey === PRIMARY_CODE_CONTINUITY_KEY) {
			opacity += layer.opacity;
		}
	}
	return Math.min(1, opacity);
}
