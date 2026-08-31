import { BrowserCaptureLibrary } from "@/infrastructure/captures/browser-capture-library";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("BrowserCaptureLibrary", () => {
	it("degrades to an empty, writable-looking library when IndexedDB is unavailable", async () => {
		vi.stubGlobal("indexedDB", undefined);
		const library = new BrowserCaptureLibrary();
		const capture = {
			id: "capture",
			createdAt: 1,
			projectId: "project",
			projectTitle: "Demo",
			filename: "demo.png",
			mimeType: "image/png",
			bytes: 4,
			blob: new Blob(["demo"], { type: "image/png" }),
		};

		expect(await library.list()).toEqual([]);
		expect(await library.add(capture)).toBe(false);
		await expect(library.remove("capture")).resolves.toBe(false);
	});

	it("refuses one capture larger than the whole local budget before opening storage", async () => {
		const library = new BrowserCaptureLibrary();
		const tooLarge = {
			id: "huge",
			createdAt: 1,
			projectId: null,
			projectTitle: "Huge",
			filename: "huge.mp4",
			mimeType: "video/mp4",
			bytes: BrowserCaptureLibrary.MAX_CAPTURE_BYTES + 1,
			blob: new Blob([], { type: "video/mp4" }),
		};

		expect(await library.add(tooLarge)).toBe(false);
	});
});
