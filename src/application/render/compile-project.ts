import { videoScript } from "../export/video-script";
import { focusLineSet, readLineRanges } from "../focus/line-ranges";
import { type MagicMovePlan, frameLineCount } from "../magic-move/engine";
import type { CodeBlockPayload, ProjectDocumentV2 } from "../project/project-document";
import type { RenderProgram } from "./render-program";

export interface CompileCodeProjectInput {
	document: ProjectDocumentV2;
	codePlan: MagicMovePlan;
	fps: number;
	loop: boolean;
}

function codeBlocks(document: ProjectDocumentV2): CodeBlockPayload[] {
	return document.project.scenes.map((scene) => {
		if (scene.blocks.length !== 1 || scene.blocks[0]?.kind !== "code") {
			throw new Error("Code compiler only accepts one code block per scene");
		}
		return scene.blocks[0];
	});
}

export function compileCodeProject(input: CompileCodeProjectInput): RenderProgram {
	const { document, codePlan, fps, loop } = input;
	if (!Number.isInteger(fps) || fps <= 0) {
		throw new Error("Render fps must be a positive integer");
	}
	const blocks = codeBlocks(document);
	if (blocks.length !== codePlan.frames.length) {
		throw new Error("Code plan frame count must match project scenes");
	}
	const first = blocks[0];
	if (!first) {
		throw new Error("Code project needs at least one scene");
	}
	for (const block of blocks) {
		if (
			block.continuityKey !== first.continuityKey ||
			block.language !== first.language ||
			block.themeName !== first.themeName
		) {
			throw new Error("Code scenes must share a compatible continuity track");
		}
	}

	const script = videoScript({
		plan: codePlan,
		durations: document.project.scenes.map((scene) => scene.durationMs),
		transitionMs: document.project.settings.transitionMs,
		fps,
		loop,
		typewriter: document.project.settings.typewriter,
		firstCode: first.code,
		focusSets: blocks.map((block) => {
			const ranges = block.focus ? readLineRanges(block.focus) : undefined;
			return ranges ? focusLineSet(ranges, frameLineCount(block.code)) : undefined;
		}),
	});

	return {
		fps,
		totalFrames: script.totalFrames,
		script,
		sceneIds: document.project.scenes.map((scene) => scene.id),
		blockIds: blocks.map((block) => block.id),
	};
}
