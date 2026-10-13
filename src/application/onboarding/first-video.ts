import type { Step } from "@/domain/entities/step";

/** Past this many scenes the visitor has found the way: the card never shows. */
export const FIRST_VIDEO_SCENE_LIMIT = 3;

export type FirstVideoStepId = "capture" | "refine" | "render";

export interface FirstVideoStep {
	readonly id: FirstVideoStepId;
	readonly title: string;
	/** The one line said under the title while this is the next step. */
	readonly line: string;
	readonly done: boolean;
}

export interface FirstVideoFacts {
	readonly sceneCount: number;
	readonly hasFocusOrCaption: boolean;
	/** A video (or a GIF) has finished rendering on this browser, ever. */
	readonly rendered: boolean;
}

export interface FirstVideoProgress {
	readonly steps: readonly FirstVideoStep[];
	readonly done: number;
	readonly total: number;
	/** The earliest step still open, or null once all three hold. */
	readonly next: FirstVideoStep | null;
	readonly complete: boolean;
}

/**
 * Where a first-time visitor stands on the way to a first video: capture a
 * scene, give it a focus or a caption, render. Pure, so the card only draws it.
 */
export function firstVideoProgress(facts: FirstVideoFacts): FirstVideoProgress {
	const steps: FirstVideoStep[] = [
		{
			id: "capture",
			title: "Capture a scene",
			line: "Turn the code on screen into your first scene.",
			done: facts.sceneCount >= 1,
		},
		{
			id: "refine",
			title: "Add a focus or a caption",
			line: "Pick the lines to spotlight, or write a short caption.",
			done: facts.hasFocusOrCaption,
		},
		{
			id: "render",
			title: "Render",
			line: "Press Export, then Render, to get your video.",
			done: facts.rendered,
		},
	];
	const done = steps.filter((step) => step.done).length;
	return {
		steps,
		done,
		total: steps.length,
		next: steps.find((step) => !step.done) ?? null,
		complete: done === steps.length,
	};
}

/** A scene carries a focus (lines to spotlight) or a caption, in any scene of the project. */
export function hasFocusOrCaption(steps: readonly Step[]): boolean {
	return steps.some((step) => step.highlightRanges.length > 0 || step.annotation !== undefined);
}

/**
 * The export store ends a PNG snapshot as "done" too; a snapshot is not the
 * video this card walks toward.
 */
export function isVideoExport(filename: string): boolean {
	return !/\.png$/i.test(filename);
}

/**
 * Whether the card is on screen: from the first scene on (on an empty project
 * the fork already says to capture, and the card would only repeat it), never
 * on a project that already has three, never after "Later", never once its
 * completion has been shown.
 */
export function firstVideoShown(input: {
	readonly sceneCount: number;
	readonly dismissed: boolean;
	readonly completed: boolean;
}): boolean {
	return (
		input.sceneCount >= 1 &&
		input.sceneCount < FIRST_VIDEO_SCENE_LIMIT &&
		!input.dismissed &&
		!input.completed
	);
}
