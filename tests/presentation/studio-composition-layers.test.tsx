import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { StudioCompositionLayers } from "@/presentation/components/preview/studio-composition-layers";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/presentation/studio-media-runtime", () => ({
	studioMediaRegistry: {
		resolve: (assetId: string) => ({ assetId, src: "blob:photo" }),
	},
}));

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "p",
		title: "P",
		canvas: { width: 1920, height: 1080, background: "#111111" },
		settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
		assets: [
			{
				id: "photo",
				kind: "image",
				fileName: "photo.png",
				mimeType: "image/png",
				byteSize: 10,
				checksum: "c".repeat(64),
				width: 1600,
				height: 900,
			},
		],
		audioCues: [],
		scenes: [
			{
				id: "s",
				durationMs: 1000,
				blocks: [
					{
						id: "image",
						kind: "image",
						assetId: "photo",
						fit: "cover",
						focalPoint: { x: 0.8, y: 0.3 },
						opacity: 1,
						placement: { x: 0.6, y: 0.12, width: 0.34, height: 0.76 },
					},
				],
			},
		],
	},
};

describe("the preview's image layer", () => {
	it("is sized by the shared media fit alone, never capped by a stylesheet", () => {
		// The studio's preflight caps every img at 100% of its box; a cover fit is
		// wider than its box by design, so the cap squashed the photo and slid it
		// out of its own clip.
		const frame = compileSceneTimeline({ document: DOCUMENT, fps: 60 }).frameAt(0);
		const { container } = render(
			<StudioCompositionLayers
				document={DOCUMENT}
				frame={frame}
				slot="over-code"
				playing={false}
				selectedBlockId={null}
				onSelectLayer={() => undefined}
			/>,
		);
		const img = container.querySelector("img");
		expect(img?.style.maxWidth).toBe("none");
		expect(img?.style.maxHeight).toBe("none");
		expect(Number.parseFloat(img?.style.width ?? "0")).toBeGreaterThan(0.34 * 1920);
	});
});
