import { execFileSync } from "node:child_process";

/**
 * What the exported file says about itself, read with the same tools a person
 * would use to check it: ffprobe for the container, ffmpeg for the pixels.
 * Both must be on PATH (CI installs them with apt).
 */

export interface VideoProbe {
	codec: string;
	width: number;
	height: number;
	/** Frames per second from the stream's declared rate. */
	fps: number;
	durationSeconds: number;
	sizeBytes: number;
}

export function probeVideo(path: string): VideoProbe {
	const output = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=codec_name,width,height,r_frame_rate:format=duration,size",
			"-of",
			"json",
			path,
		],
		{ encoding: "utf8" },
	);
	const parsed = JSON.parse(output) as {
		streams: { codec_name: string; width: number; height: number; r_frame_rate: string }[];
		format: { duration: string; size: string };
	};
	const stream = parsed.streams[0];
	if (!stream) throw new Error(`${path} has no video stream`);
	const [num, den] = stream.r_frame_rate.split("/").map(Number);
	return {
		codec: stream.codec_name,
		width: stream.width,
		height: stream.height,
		fps: (num ?? 0) / (den || 1),
		durationSeconds: Number(parsed.format.duration),
		sizeBytes: Number(parsed.format.size),
	};
}

/**
 * One picture as raw RGB at `width` x `height`, area-averaged. `atSeconds`
 * seeks a video; leave it out for a still image. Downscaling both sides of a
 * comparison the same way keeps the measure about the picture, not about how
 * two rasterizers anti-alias one glyph edge.
 */
export function rgbPixels(path: string, width: number, height: number, atSeconds?: number): Buffer {
	const seek = atSeconds === undefined ? [] : ["-ss", atSeconds.toFixed(3)];
	return execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			...seek,
			"-i",
			path,
			"-frames:v",
			"1",
			"-vf",
			`scale=${width}:${height}:flags=area`,
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"pipe:1",
		],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
}

/** Mean absolute difference per channel, 0 (identical) to 255. */
export function meanAbsoluteError(a: Buffer, b: Buffer): number {
	if (a.length !== b.length) throw new Error(`size mismatch: ${a.length} vs ${b.length}`);
	let total = 0;
	for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
	return total / a.length;
}
