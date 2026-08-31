import {
	type CaptureRecord,
	captureKind,
	formatCaptureBytes,
	sortCaptures,
} from "@/application/captures/capture-record";
import { describe, expect, it } from "vitest";

function capture(id: string, createdAt: number): CaptureRecord {
	return {
		id,
		createdAt,
		projectId: "project",
		projectTitle: "Demo",
		filename: `${id}.png`,
		mimeType: "image/png",
		bytes: 1_024,
		blob: new Blob([id], { type: "image/png" }),
	};
}

describe("capture library model", () => {
	it("distinguishes stills, videos and GIFs for honest previews", () => {
		expect(captureKind("image/png")).toBe("image");
		expect(captureKind("image/gif")).toBe("image");
		expect(captureKind("video/mp4")).toBe("video");
		expect(captureKind("video/webm")).toBe("video");
	});

	it("sorts newest captures first without mutating its input", () => {
		const input = [capture("old", 10), capture("new", 20)];
		const sorted = sortCaptures(input);
		expect(sorted.map((item) => item.id)).toEqual(["new", "old"]);
		expect(input.map((item) => item.id)).toEqual(["old", "new"]);
	});

	it("formats storage size compactly", () => {
		expect(formatCaptureBytes(800)).toBe("800 B");
		expect(formatCaptureBytes(1_024)).toBe("1 KB");
		expect(formatCaptureBytes(1_572_864)).toBe("1.5 MB");
	});
});
