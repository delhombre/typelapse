/**
 * The one place that asks the browser what it will actually encode.
 *
 * There used to be three of these — the panel's support check, the worker's
 * pre-flight, and the alpha question — and each asked a slightly different
 * question, which is how a probe stops being evidence. They ask the same one
 * now, of the same ladder, with the config the export is really going to run.
 *
 * Two gates, because a yes from either alone would not be a yes:
 *
 *  - **WebCodecs**, with the exact codec string. A generic `av1` yes says
 *    nothing about High profile, and High profile — 4:4:4 chroma — is the whole
 *    reason the ladder starts where it does. It is also the only gate that takes
 *    a frame rate, and a level is a budget of samples per second.
 *  - **mediabunny**, because mediabunny is what runs the encoder. It builds its
 *    own codec string unless it is handed one, so the string is pinned here too
 *    and `canEncodeVideo` is asked whether it will take it. A rung the muxer
 *    would refuse is not a rung.
 */

import { Quality, canEncodeVideo } from "mediabunny";
import { type CodecRung, chooseRung, encodingQuality } from "./video-encoding";

/** The export as the encoder will see it. */
export interface ProbeFrame {
	width: number;
	height: number;
	fps: number;
	/** Whether the encoder is being asked to carry an alpha channel. */
	alpha?: "keep" | "discard";
}

/**
 * The rungs this browser said yes to, by codec string.
 *
 * It stops at the first yes on purpose: the ladder's order *is* the decision, so
 * every rung below the winner is one nothing will ever reach, and asking about
 * it would be work no one reads. What comes back is therefore a set with one
 * entry, or none at all.
 */
export async function encodableRungs(
	ladder: readonly CodecRung[],
	frame: ProbeFrame,
): Promise<Set<string>> {
	const accepted = new Set<string>();
	if (typeof VideoEncoder === "undefined") {
		return accepted;
	}
	for (const rung of ladder) {
		if (await accepts(rung, frame)) {
			accepted.add(rung.codecString);
			break;
		}
	}
	return accepted;
}

/** The best rung this browser will encode, or nothing at all. */
export async function firstEncodableRung(
	ladder: readonly CodecRung[],
	frame: ProbeFrame,
): Promise<CodecRung | null> {
	return chooseRung(ladder, await encodableRungs(ladder, frame));
}

async function accepts(rung: CodecRung, frame: ProbeFrame): Promise<boolean> {
	const quality = encodingQuality(rung.codec, frame.width, frame.height, frame.fps);
	try {
		const support = await VideoEncoder.isConfigSupported({
			codec: rung.codecString,
			width: frame.width,
			height: frame.height,
			framerate: frame.fps,
			bitrate: quality.bitrate,
			alpha: frame.alpha ?? "discard",
		});
		if (!support.supported) {
			return false;
		}
	} catch {
		// A build that will not even consider the configuration is a no.
		return false;
	}
	try {
		// The quantizer travels with a bitrate behind it wherever there is one, so
		// this asks the same question the encode will: constant quality first, the
		// budget as the fallback.
		return await canEncodeVideo(rung.codec, {
			width: frame.width,
			height: frame.height,
			quality: qualityOf(rung, frame),
			fullCodecString: rung.codecString,
		});
	} catch {
		return false;
	}
}

/** What to ask this rung for, in the shape mediabunny takes. */
export function qualityOf(rung: CodecRung, frame: ProbeFrame): Quality {
	const { bitrate, quantizer } = encodingQuality(rung.codec, frame.width, frame.height, frame.fps);
	return quantizer === null ? new Quality({ bitrate }) : new Quality({ quantizer, bitrate });
}
