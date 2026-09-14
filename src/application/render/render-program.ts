import type { ScriptFrame, ScriptSegment, VideoScript } from "../export/video-script";

export interface CodeRenderLayer {
	kind: "code";
	blockId: string;
	frame: ScriptFrame;
}

export type RenderLayer = CodeRenderLayer;

export interface RenderFrame {
	sceneId: string;
	localTimeMs: number;
	progress: number;
	layers: RenderLayer[];
}

export interface RenderProgram {
	fps: number;
	totalFrames: number;
	script: VideoScript;
	sceneIds: readonly string[];
	blockIds: readonly string[];
}

function locateSegment(
	segments: readonly ScriptSegment[],
	frame: number,
): ScriptSegment | undefined {
	return (
		segments.find((segment) => frame >= segment.startFrame && frame < segment.endFrame) ??
		segments.at(-1)
	);
}

function sceneIndexFor(segment: ScriptSegment | undefined, frame: number): number {
	if (!segment) {
		return 0;
	}
	if (segment.type === "hold") {
		return segment.index;
	}
	const span = Math.max(1, segment.endFrame - segment.startFrame);
	const progress = (frame - segment.startFrame) / span;
	if (progress < 0.5) {
		return segment.index;
	}
	return segment.type === "loop" ? 0 : segment.index + 1;
}

export function frameAt(program: RenderProgram, requestedFrame: number): RenderFrame {
	const frame = Math.min(Math.max(Math.floor(requestedFrame), 0), program.totalFrames - 1);
	const segment = locateSegment(program.script.segments, frame);
	const sceneIndex = sceneIndexFor(segment, frame);
	const sceneId = program.sceneIds[sceneIndex] ?? program.sceneIds[0];
	const blockId = program.blockIds[sceneIndex] ?? program.blockIds[0];
	if (!sceneId || !blockId) {
		throw new Error("Render program has no scene");
	}
	const localTimeMs = segment
		? Math.max(0, ((frame - segment.startFrame) / program.fps) * 1000)
		: 0;
	const resolved = program.script.frameAt(frame);
	return {
		sceneId,
		localTimeMs,
		progress: resolved.progress,
		layers: [{ kind: "code", blockId, frame: resolved }],
	};
}
