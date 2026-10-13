/**
 * The clip `pnpm render:smoke` renders, and how it is judged.
 *
 * A Vitest run and a Vite build both pass while Remotion's own webpack cannot
 * bundle the composition (an `@/` alias it does not know), and every render then
 * fails. So the gate renders one real clip through the shipped route and measures
 * the file. The render lives in `scripts/render-smoke.ts`; what decides pass or
 * fail is here, pure, so it is tested without a browser.
 */

import type { ProjectPayload } from "@/application/project/project-payload";
import type { TemplateDefinition } from "@/application/templates/catalog";

/** 640x360 at 30 fps for two seconds: two scenes of 800 ms and one 400 ms morph. */
export const SMOKE = {
	width: 640,
	height: 360,
	fps: 30,
	holdMs: 800,
	transitionMs: 400,
	seconds: 2,
	codec: "h264",
	/** The mp4 muxer and the frame rounding move the length by a frame or two. */
	toleranceSeconds: 0.25,
} as const;

export interface ProbeSummary {
	file: string;
	codec: string;
	width: number;
	height: number;
	fps: number;
	frames: number;
	durationSeconds: number;
	sizeBytes: number;
}

const codeLength = (project: ProjectPayload): number =>
	project.steps.slice(0, 2).reduce((total, step) => total + step.code.length, 0);

/** The smallest template, cut to the two scenes and the size the smoke renders. */
export function smokeProject(catalog: readonly TemplateDefinition[]): ProjectPayload {
	const [smallest] = catalog
		.filter((template) => template.project.steps.length >= 2)
		.sort((a, b) => codeLength(a.project) - codeLength(b.project));
	if (!smallest) {
		throw new Error("The template catalog has no template with two scenes to render.");
	}
	const steps = smallest.project.steps
		.slice(0, 2)
		.map((step) => ({ ...step, duration: SMOKE.holdMs }));
	return {
		...smallest.project,
		code: steps[0]?.code ?? smallest.project.code,
		steps,
		transitionMs: SMOKE.transitionMs,
		width: SMOKE.width,
		height: SMOKE.height,
		fps: SMOKE.fps,
		typewriter: false,
		focusZoom: false,
	};
}

interface ProbeJson {
	streams?: Array<{
		codec_type?: string;
		codec_name?: string;
		width?: number;
		height?: number;
		avg_frame_rate?: string;
		nb_frames?: string;
	}>;
	format?: { duration?: string; size?: string };
}

/** `ffprobe -of json` output → the numbers that say what the file really is. */
export function parseProbe(json: string, file: string): ProbeSummary {
	let probe: ProbeJson;
	try {
		probe = JSON.parse(json) as ProbeJson;
	} catch {
		throw new Error(`ffprobe did not return JSON for ${file}: ${json.slice(0, 120) || "(empty)"}`);
	}
	const video = probe.streams?.find((stream) => stream.codec_type === "video");
	if (!video) {
		throw new Error(`ffprobe found no video stream in ${file}`);
	}
	const [num = 0, den = 1] = (video.avg_frame_rate ?? "0/1").split("/").map(Number);
	return {
		file,
		codec: video.codec_name ?? "unknown",
		width: video.width ?? 0,
		height: video.height ?? 0,
		fps: den === 0 ? 0 : Math.round((num / den) * 100) / 100,
		frames: Number(video.nb_frames ?? 0),
		durationSeconds: Number(probe.format?.duration ?? 0),
		sizeBytes: Number(probe.format?.size ?? 0),
	};
}

/** What is wrong with the clip, one sentence each. Empty means it is the clip that was asked for. */
export function judgeClip(clip: ProbeSummary): string[] {
	const problems: string[] = [];
	if (clip.sizeBytes <= 0) {
		problems.push("the file is empty");
	}
	if (clip.codec !== SMOKE.codec) {
		problems.push(`the codec is ${clip.codec}, not ${SMOKE.codec}`);
	}
	if (clip.width !== SMOKE.width || clip.height !== SMOKE.height) {
		problems.push(
			`the frame is ${clip.width}x${clip.height}, not the ${SMOKE.width}x${SMOKE.height} asked for`,
		);
	}
	if (clip.fps !== SMOKE.fps) {
		problems.push(`the frame rate is ${clip.fps} fps, not the ${SMOKE.fps} fps asked for`);
	}
	const expectedFrames = SMOKE.fps * SMOKE.seconds;
	if (Math.abs(clip.frames - expectedFrames) > 1) {
		problems.push(`the clip has ${clip.frames} frames, not the ${expectedFrames} asked for`);
	}
	if (Math.abs(clip.durationSeconds - SMOKE.seconds) > SMOKE.toleranceSeconds) {
		problems.push(
			`the clip lasts ${clip.durationSeconds.toFixed(2)}s, not the ${SMOKE.seconds}s asked for`,
		);
	}
	return problems;
}

/** The one line the gate quotes: the file, then what ffprobe says it is. */
export function summaryLine(clip: ProbeSummary, renderMs: number): string {
	const kilobytes = `${(clip.sizeBytes / 1024).toFixed(1)} KB`;
	return [
		`render-smoke OK: ${clip.file}`,
		`${clip.durationSeconds.toFixed(2)}s`,
		kilobytes,
		clip.codec,
		`${clip.width}x${clip.height}`,
		`${clip.fps} fps`,
		`${clip.frames} frames`,
		`rendered in ${(renderMs / 1000).toFixed(1)}s`,
	].join(" | ");
}
