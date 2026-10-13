/**
 * Whether a target's export draws the steps' captions inside the frame.
 *
 * Only the Remotion composition does (the local server and Cloud). The
 * on-device painter (`application/frame-painter/`) keeps the caption band in its
 * layout and bakes nothing into it, so the preview, which must show what the
 * chosen Where exports, leaves the frame's band empty there.
 */
export type CaptionTarget = "device" | "server" | "cloud";

export function captionsBakedFor(target: CaptionTarget): boolean {
	return target !== "device";
}
