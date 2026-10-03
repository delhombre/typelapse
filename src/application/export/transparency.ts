/**
 * What each container can do with a background of `None`, decided once.
 *
 * The renderer used to paint every frame onto a context created with
 * `alpha: false`, which is the right choice for a mesh — it makes a GIF's
 * pixel read-back a copy rather than a composite — and the wrong one for a
 * frame that is supposed to have nothing behind it. On a context with no alpha
 * channel, erasing gives opaque black. Measured: `clearRect` on `alpha: false`
 * returns `rgba(0,0,0,255)`.
 *
 * So the canvas now follows the scene. But a transparent canvas is only worth
 * having if the file can hold what is on it, and the three formats differ:
 *
 *  - GIF carries transparency as one bit per pixel. Real, and lossy in a way
 *    worth naming: a rounded corner comes out stepped rather than soft.
 *  - WebM can carry it, as codec alpha side data, *if the browser's encoder will
 *    do it*. This one will not: `isConfigSupported` refuses `alpha: "keep"` for
 *    AV1, VP9, VP8 and H.264 alike, so it has to be asked at run time — and it
 *    is asked of every rung of the WebM ladder before one is picked, so a
 *    transparent export gets whichever codec would actually keep the channel
 *    rather than whichever is best at everything else.
 *  - MP4 cannot, ever. H.264 has no alpha channel.
 *
 * Where it cannot be carried the frame is flattened deliberately — an opaque
 * canvas, so the black is a decision rather than an artefact — and the panel is
 * given a sentence saying which.
 */

import type { RenderFormat } from "@/domain/entities/render-config";
import { parseBackdrop } from "../backgrounds/backdrop";

export interface TransparencyPlan {
	/** Paint onto a context that keeps its alpha channel. */
	keepAlpha: boolean;
	/** Ask the video encoder to carry the alpha through. */
	encodeAlpha: boolean;
	outcome: "opaque" | "carried" | "flattened";
	/** What the finished file is not, having been asked for. */
	note: string | null;
}

export interface TransparencyInput {
	format: RenderFormat;
	background: string;
	/** Whether this browser's encoder accepts `alpha: "keep"` for the codec. */
	encoderKeepsAlpha: boolean;
}

/** True when the frame is supposed to have nothing behind it. */
export function wantsTransparency(background: string): boolean {
	return parseBackdrop(background).kind === "transparent";
}

export function transparencyPlan(input: TransparencyInput): TransparencyPlan {
	if (!wantsTransparency(input.background)) {
		return { keepAlpha: false, encodeAlpha: false, outcome: "opaque", note: null };
	}
	if (input.format === "gif") {
		return {
			keepAlpha: true,
			encodeAlpha: false,
			outcome: "carried",
			note: "a GIF's transparency is one bit per pixel, so the card's rounded corners are hard-edged",
		};
	}
	if (input.format === "webm" && input.encoderKeepsAlpha) {
		return { keepAlpha: true, encodeAlpha: true, outcome: "carried", note: null };
	}
	return {
		keepAlpha: false,
		encodeAlpha: false,
		outcome: "flattened",
		// GIF is the one format named as the way out, because it is the only one
		// that keeps the channel everywhere: the server's WebM is captured as JPEG
		// and encoded 4:2:0, so it flattens too, and this browser's WebM just said
		// it would not carry alpha either.
		note:
			input.format === "webm"
				? "no WebM encoder on this browser will carry an alpha channel, so the transparent background was flattened to black. Export GIF to keep it"
				: "MP4 (H.264) has no alpha channel, so the transparent background was flattened to black. Export GIF to keep it",
	};
}
