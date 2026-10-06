import type { VideoScript } from "./video-script";

/**
 * The frame of the video a PNG snapshot of one scene is cut from.
 *
 * A snapshot is not a fourth renderer: it is one frame of the export, painted by
 * the same painter at the same size, so the frame has to be named the way the
 * file names it. The last frame of the scene's hold is the one where the scene
 * has finished settling: a typed scene is fully typed, and the next scene's morph
 * has not begun to move anything.
 *
 * A scene the script does not know (a stale index) falls back to the first
 * frame, and a hold of zero frames resolves to the frame its morph starts on,
 * which draws that scene's own picture.
 */
export function stillFrameOf(script: Pick<VideoScript, "segments">, sceneIndex: number): number {
	const hold = script.segments.find((s) => s.type === "hold" && s.index === sceneIndex);
	if (!hold) {
		return 0;
	}
	return Math.max(hold.startFrame, hold.endFrame - 1);
}
