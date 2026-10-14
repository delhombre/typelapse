/**
 * Scene breaks in the V2 document (#280).
 *
 * A step that opens a new page or chapter of an import (`Step.sceneBreak`, V1)
 * is stored on the scene before it, as that scene's outgoing transition: a
 * `crossfade` instead of a `magic-move`, over the same duration, so the video
 * keeps its length. Only a magic move matches tokens; every other kind is read
 * back as a break, so the keyers fade across it.
 */

interface WithTransition {
	readonly transitionOut?: { readonly kind: string };
}

/** The outgoing transition of a code scene, given whether the next scene opens on a break. */
export function codeSceneTransition(
	nextOpensScene: boolean,
	durationMs: number,
): { readonly kind: "crossfade" | "magic-move"; readonly durationMs: number } {
	return { kind: nextOpensScene ? "crossfade" : "magic-move", durationMs };
}

/** Whether each scene opens on a break: the transition out of the scene before it is no morph. */
export function sceneBreaks(scenes: readonly WithTransition[]): boolean[] {
	return scenes.map((_, index) => {
		const kind = scenes[index - 1]?.transitionOut?.kind;
		return kind !== undefined && kind !== "magic-move";
	});
}
