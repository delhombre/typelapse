import {
	deviceExportRefusal,
	undecodableVideoRefusal,
} from "@/application/export/device-export-refusal";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

function documentWith(
	kinds: ("text" | "image" | "video")[],
	videoMimeType = "video/mp4",
): ProjectDocumentV2 {
	const base = { opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } };
	return {
		schemaVersion: 2,
		project: {
			id: "p",
			title: "P",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [
				{
					id: "a",
					kind: "video",
					fileName: "clip.avi",
					mimeType: videoMimeType,
					byteSize: 10,
					checksum: "c".repeat(64),
					width: 1920,
					height: 1080,
					durationMs: 5000,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "s",
					durationMs: 1000,
					blocks: kinds.map((kind, index) => {
						const id = `${kind}-${index}`;
						if (kind === "text") {
							return {
								...base,
								id,
								kind,
								text: "Hi",
								typography: {
									fontFamily: "Geist",
									fontSize: 88,
									fontWeight: 650,
									color: "#fff",
									align: "center" as const,
								},
							};
						}
						const media = {
							...base,
							id,
							assetId: "a",
							fit: "cover" as const,
							focalPoint: { x: 0.5, y: 0.5 },
						};
						return kind === "image"
							? { ...media, kind }
							: { ...media, kind, trim: { startMs: 0, endMs: 1000 }, playbackRate: 1, muted: true };
					}),
				},
			],
		},
	};
}

describe("deviceExportRefusal", () => {
	it("lets text and image layers render on this device", () => {
		expect(deviceExportRefusal(documentWith(["text", "image"]))).toBeNull();
	});

	it("lets a video layer in a container this device reads render on this device", () => {
		for (const mimeType of ["video/mp4", "video/webm", "video/quicktime"]) {
			expect(deviceExportRefusal(documentWith(["text", "video"], mimeType))).toBeNull();
		}
	});

	it("refuses a container this device cannot read in one sentence that offers the server", () => {
		expect(deviceExportRefusal(documentWith(["video"], "video/x-msvideo"))).toBe(
			"This device cannot read clip.avi; choose Server under Where to render this project.",
		);
	});

	it("names the file this browser cannot decode in the same sentence shape", () => {
		expect(undecodableVideoRefusal("clip.mov")).toBe(
			"This browser cannot decode clip.mov; choose Server under Where to render this project.",
		);
	});
});
