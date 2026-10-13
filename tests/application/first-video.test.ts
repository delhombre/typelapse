import {
	FIRST_VIDEO_SCENE_LIMIT,
	firstVideoProgress,
	firstVideoShown,
	hasFocusOrCaption,
	isVideoExport,
} from "@/application/onboarding/first-video";
import { Step } from "@/domain/entities/step";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { describe, expect, it } from "vitest";

const none = { sceneCount: 0, hasFocusOrCaption: false, rendered: false };

describe("the first video's progress", () => {
	it("starts at none of three and names capture as the next step", () => {
		const progress = firstVideoProgress(none);
		expect(progress.done).toBe(0);
		expect(progress.total).toBe(3);
		expect(progress.next?.id).toBe("capture");
		expect(progress.complete).toBe(false);
	});

	it("ticks capture from the scene count and moves on to focus or caption", () => {
		const progress = firstVideoProgress({ ...none, sceneCount: 1 });
		expect(progress.done).toBe(1);
		expect(progress.next?.id).toBe("refine");
	});

	it("ticks the second step once a focus or a caption exists, and asks for the render", () => {
		const progress = firstVideoProgress({
			sceneCount: 2,
			hasFocusOrCaption: true,
			rendered: false,
		});
		expect(progress.done).toBe(2);
		expect(progress.next?.id).toBe("render");
	});

	it("is complete with nothing left to ask once all three hold", () => {
		const progress = firstVideoProgress({ sceneCount: 1, hasFocusOrCaption: true, rendered: true });
		expect(progress.done).toBe(3);
		expect(progress.complete).toBe(true);
		expect(progress.next).toBeNull();
	});

	it("shows the earliest step still open, not the latest one done", () => {
		// A render before any caption leaves the middle step as the one to do.
		const progress = firstVideoProgress({
			sceneCount: 1,
			hasFocusOrCaption: false,
			rendered: true,
		});
		expect(progress.done).toBe(2);
		expect(progress.next?.id).toBe("refine");
	});

	it("gives every step a title and exactly one line, without an em-dash", () => {
		for (const step of firstVideoProgress(none).steps) {
			expect(step.title).not.toBe("");
			expect(step.line).not.toContain("\n");
			expect(`${step.title}${step.line}`).not.toContain("—");
		}
	});
});

describe("what counts as a focus or a caption", () => {
	const range = HighlightRange.create({ startLine: 1, endLine: 2 });

	it("is a scene with focused lines", () => {
		expect(hasFocusOrCaption([Step.create({ code: "a", highlightRanges: [range] })])).toBe(true);
	});

	it("is a scene with a caption", () => {
		expect(hasFocusOrCaption([Step.create({ code: "a", annotation: "Why" })])).toBe(true);
	});

	it("is not a bare scene, nor a blank caption", () => {
		expect(hasFocusOrCaption([])).toBe(false);
		expect(
			hasFocusOrCaption([Step.create({ code: "a" }), Step.create({ code: "b", annotation: "  " })]),
		).toBe(false);
	});

	it("looks at every scene, not only the selected one", () => {
		expect(
			hasFocusOrCaption([
				Step.create({ code: "a" }),
				Step.create({ code: "b", annotation: "Why" }),
			]),
		).toBe(true);
	});
});

describe("what counts as a rendered video", () => {
	it("is a video or a GIF, and not the PNG snapshot that also ends as done", () => {
		expect(isVideoExport("typelapse.mp4")).toBe(true);
		expect(isVideoExport("typelapse.webm")).toBe(true);
		expect(isVideoExport("typelapse.gif")).toBe(true);
		expect(isVideoExport("typelapse.png")).toBe(false);
		expect(isVideoExport("typelapse.PNG")).toBe(false);
	});
});

describe("when the card shows", () => {
	const open = { sceneCount: 1, dismissed: false, completed: false };

	it("shows once a scene is captured, as progress earned", () => {
		expect(firstVideoShown(open)).toBe(true);
		expect(firstVideoShown({ ...open, sceneCount: 2 })).toBe(true);
	});

	it("never shows on an empty project, where the fork already says to capture", () => {
		expect(firstVideoShown({ ...open, sceneCount: 0 })).toBe(false);
	});

	it("never shows on a project with three or more scenes", () => {
		expect(FIRST_VIDEO_SCENE_LIMIT).toBe(3);
		expect(firstVideoShown({ ...open, sceneCount: 3 })).toBe(false);
		expect(firstVideoShown({ ...open, sceneCount: 12 })).toBe(false);
	});

	it("stays away once dismissed or once its completion has been shown", () => {
		expect(firstVideoShown({ ...open, dismissed: true })).toBe(false);
		expect(firstVideoShown({ ...open, completed: true })).toBe(false);
	});
});
