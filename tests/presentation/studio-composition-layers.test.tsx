import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { StudioCompositionLayers } from "@/presentation/components/preview/studio-composition-layers";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
				fps={60}
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

const CLIP_DOCUMENT: ProjectDocumentV2 = {
	...DOCUMENT,
	project: {
		...DOCUMENT.project,
		assets: [
			{
				id: "clip",
				kind: "video",
				fileName: "clip.mp4",
				mimeType: "video/mp4",
				byteSize: 10,
				checksum: "d".repeat(64),
				width: 1920,
				height: 1080,
				durationMs: 5000,
			},
		],
		scenes: [
			{
				id: "s",
				durationMs: 2000,
				blocks: [
					{
						id: "clip-layer",
						kind: "video",
						assetId: "clip",
						fit: "cover",
						focalPoint: { x: 0.5, y: 0.5 },
						trim: { startMs: 0, endMs: 5000 },
						playbackRate: 1,
						muted: true,
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	},
};

describe("the paused preview's video layer (ticket #108)", () => {
	// jsdom keeps no media clock, so the element's time is a plain value here and
	// every assignment is a seek the test can count.
	let seeks: number[];
	beforeEach(() => {
		seeks = [];
		const times = new WeakMap<HTMLMediaElement, number>();
		Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
			configurable: true,
			get(this: HTMLMediaElement) {
				return times.get(this) ?? 0;
			},
			set(this: HTMLMediaElement, value: number) {
				seeks.push(value);
				times.set(this, value);
			},
		});
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
	});
	afterEach(() => {
		Reflect.deleteProperty(HTMLMediaElement.prototype, "currentTime");
		vi.restoreAllMocks();
	});

	function layersAt(frame: number, fps: number) {
		return (
			<StudioCompositionLayers
				document={CLIP_DOCUMENT}
				frame={compileSceneTimeline({ document: CLIP_DOCUMENT, fps }).frameAt(frame)}
				fps={fps}
				slot="over-code"
				playing={false}
				selectedBlockId={null}
				onSelectLayer={() => undefined}
			/>
		);
	}

	it("seeks to the next source time on a one-frame step at 60 fps", () => {
		const view = render(layersAt(30, 60));
		const video = view.container.querySelector("video") as HTMLVideoElement;
		expect(video.currentTime).toBeCloseTo(0.5, 6);

		for (const frame of [31, 32, 33]) {
			view.rerender(layersAt(frame, 60));
			expect(video.currentTime).toBeCloseTo(frame / 60, 6);
		}
	});

	it("leaves a clip alone that is less than half a frame off", () => {
		const view = render(layersAt(30, 60));
		const video = view.container.querySelector("video") as HTMLVideoElement;
		video.currentTime = 0.5 + 0.4 / 60;
		seeks.length = 0;

		view.rerender(layersAt(30, 60));
		expect(seeks).toEqual([]);
	});
});
