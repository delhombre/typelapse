import { deviceExportRefusal } from "@/application/export/device-export-refusal";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

function documentWith(kinds: ("text" | "image" | "video")[]): ProjectDocumentV2 {
	const base = { opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } };
	return {
		schemaVersion: 2,
		project: {
			id: "p",
			title: "P",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [],
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

	it("refuses a video layer in one sentence that offers the server", () => {
		expect(deviceExportRefusal(documentWith(["text", "video"]))).toBe(
			"This device cannot draw video layers yet; choose Server under Where to render this project.",
		);
	});
});
