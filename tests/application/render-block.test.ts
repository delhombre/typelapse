import {
	NOTHING_TO_CAPTURE,
	NOTHING_TO_RENDER,
	WRITE_CODE_TO_RENDER,
	captureBlockReason,
	renderBlock,
} from "@/application/export/render-block";
import { describe, expect, it } from "vitest";

describe("renderBlock", () => {
	it("is absent once there is a scene to render", () => {
		expect(renderBlock({ sceneCount: 1, hasMedia: false, emptyDraft: false })).toBeNull();
	});

	it("is absent for authored media alone, as it is for Play", () => {
		expect(renderBlock({ sceneCount: 0, hasMedia: true, emptyDraft: false })).toBeNull();
	});

	it("says a video needs a scene, and offers the capture, when code is waiting", () => {
		expect(renderBlock({ sceneCount: 0, hasMedia: false, emptyDraft: false })).toEqual({
			reason: NOTHING_TO_RENDER,
			canCapture: true,
		});
	});

	it("asks for code first when the editor is emptied, since there is nothing to capture", () => {
		expect(renderBlock({ sceneCount: 0, hasMedia: false, emptyDraft: true })).toEqual({
			reason: WRITE_CODE_TO_RENDER,
			canCapture: false,
		});
	});

	it("keeps the reason while an emptied editor still leaves media alone with nothing to show", () => {
		expect(renderBlock({ sceneCount: 0, hasMedia: true, emptyDraft: true })).not.toBeNull();
	});

	it("never blames the editor once a scene exists", () => {
		expect(renderBlock({ sceneCount: 3, hasMedia: false, emptyDraft: true })).toBeNull();
	});
});

describe("captureBlockReason", () => {
	it("explains a disabled Capture with an empty editor", () => {
		expect(captureBlockReason(true)).toBe(NOTHING_TO_CAPTURE);
		expect(NOTHING_TO_CAPTURE).toBe("Write some code to capture.");
	});

	it("is absent when there is code to capture", () => {
		expect(captureBlockReason(false)).toBeNull();
	});
});
