import { isPlayableProject } from "@/application/studio-timeline/playback";

/**
 * Why Render is off, in the words the studio says next to it.
 *
 * A disabled primary action with its reason only in a `title` is a button that
 * looks broken: a tooltip never shows on a phone, and a screen reader does not
 * reach a disabled button at all (DECISIONS D2, `cluster-panels.tsx`). The
 * sentence is therefore data, picked here, and drawn beside the button by both
 * the phone's sheet and the desktop rail.
 */

/** A video needs a scene; the editor still holds code to make one from. */
export const NOTHING_TO_RENDER = "A video needs at least one scene.";

/** The editor is emptied too, so Capture cannot make the scene yet. */
export const WRITE_CODE_TO_RENDER = "Write some code, then capture it as a scene.";

/** Capture is off while the editor holds nothing. */
export const NOTHING_TO_CAPTURE = "Write some code to capture.";

export interface RenderBlock {
	readonly reason: string;
	/** True when Capture would unblock it, so the note can offer that shortcut. */
	readonly canCapture: boolean;
}

/** `null` when Render is available; otherwise the reason and the way out. */
export function renderBlock(input: {
	sceneCount: number;
	hasMedia: boolean;
	emptyDraft: boolean;
}): RenderBlock | null {
	if (isPlayableProject(input.sceneCount, input.hasMedia, input.emptyDraft)) {
		return null;
	}
	if (input.emptyDraft && input.sceneCount === 0) {
		return { reason: WRITE_CODE_TO_RENDER, canCapture: false };
	}
	return { reason: NOTHING_TO_RENDER, canCapture: !input.emptyDraft };
}

/** `null` when there is code to capture. */
export function captureBlockReason(emptyDraft: boolean): string | null {
	return emptyDraft ? NOTHING_TO_CAPTURE : null;
}
