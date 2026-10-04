/**
 * The on-device export of a studio project with text and image layers
 * (ticket #93): what the job carries to the worker, and what the worker builds
 * from it before painting a frame.
 */

import { DEFAULT_TRANSITION_EASING } from "@/application/magic-move/easing";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { ClientExportJob } from "@/infrastructure/export/client-export-job";
import {
	compositionPlanFor,
	sceneInputFor,
	textFontStacks,
} from "@/infrastructure/export/client-export-scene";
import { decodeCompositionImages } from "@/infrastructure/export/composition-images";
import { describe, expect, it, vi } from "vitest";

const PHOTO = {
	id: "asset-photo",
	kind: "image" as const,
	fileName: "photo.png",
	mimeType: "image/png",
	byteSize: 10,
	checksum: "b".repeat(64),
	width: 1600,
	height: 900,
};

const UNUSED = { ...PHOTO, id: "asset-unused", fileName: "unused.png" };

function code(id: string) {
	return {
		id,
		kind: "code" as const,
		code: "const a = 1;",
		language: "typescript",
		themeName: "midnight",
		chrome: "macos" as const,
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		continuityKey: "primary-code",
		opacity: 1,
		placement: { x: 0, y: 0, width: 1, height: 1 },
	};
}

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "proof",
		title: "Proof",
		canvas: { width: 1920, height: 1080, background: "#101014" },
		settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
		assets: [PHOTO, UNUSED],
		audioCues: [],
		scenes: [
			{
				id: "a",
				durationMs: 1000,
				transitionOut: { kind: "magic-move", durationMs: 650 },
				blocks: [
					code("a::code"),
					{
						id: "title",
						kind: "text",
						text: "Ship it",
						opacity: 1,
						placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
						typography: {
							fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
							fontSize: 88,
							fontWeight: 650,
							color: "#fffaf0",
							align: "center",
						},
					},
				],
			},
			{
				id: "b",
				durationMs: 1000,
				blocks: [
					{
						id: "photo",
						kind: "image",
						assetId: "asset-photo",
						fit: "cover",
						focalPoint: { x: 0.5, y: 0.5 },
						borderRadius: 24,
						opacity: 1,
						placement: { x: 0.5, y: 0.1, width: 0.4, height: 0.8 },
					},
					code("b::code"),
				],
			},
		],
	},
};

describe("decodeCompositionImages", () => {
	it("decodes the bytes of every image a layer shows, and no other", async () => {
		const blob = new Blob(["png"], { type: "image/png" });
		const loadAsset = vi.fn(async () => ({
			assetId: "asset-photo",
			mimeType: "image/png",
			byteSize: 3,
			opaqueHandle: blob,
		}));
		const decode = vi.fn(async () => ({ label: "bitmap" }) as unknown as ImageBitmap);

		const images = await decodeCompositionImages(DOCUMENT, { loadAsset }, decode);

		expect(loadAsset).toHaveBeenCalledTimes(1);
		expect(loadAsset).toHaveBeenCalledWith({ projectId: "proof", assetId: "asset-photo" });
		expect(decode).toHaveBeenCalledWith(blob);
		expect(images).toEqual([{ assetId: "asset-photo", bitmap: { label: "bitmap" } }]);
	});

	it("refuses, naming the file, when this browser does not have its bytes", async () => {
		const loadAsset = vi.fn(async () => null);
		await expect(decodeCompositionImages(DOCUMENT, { loadAsset }, vi.fn())).rejects.toThrow(
			"photo.png is unavailable on this device.",
		);
	});
});

describe("compositionPlanFor", () => {
	const images = [{ assetId: "asset-photo", bitmap: { label: "photo" } as unknown as ImageBitmap }];

	it("lays out each frame from the scene compiler, scaled to the export canvas", () => {
		const plan = compositionPlanFor(
			{ document: DOCUMENT, images, videos: [] },
			{ width: 960, fps: 30, loop: false },
		);
		const first = plan.layersAt(0);
		expect(first.surfaceScale).toBe(0.5);
		expect(first.over.map((layer) => layer.kind)).toEqual(["text"]);

		const later = plan.layersAt(Math.round(2 * 30));
		expect(later.under).toMatchObject([{ kind: "image", radius: 24, image: { label: "photo" } }]);
	});

	it("runs as long as the compiled timeline", () => {
		const plan = compositionPlanFor(
			{ document: DOCUMENT, images, videos: [] },
			{ width: 1920, fps: 60, loop: false },
		);
		// Two one-second scenes and one 650 ms transition.
		expect(plan.totalFrames).toBe(Math.round(2.65 * 60));
	});
});

const CLIP = {
	id: "asset-clip",
	kind: "video" as const,
	fileName: "counter.mp4",
	mimeType: "video/mp4",
	byteSize: 10,
	checksum: "c".repeat(64),
	width: 1920,
	height: 1080,
	durationMs: 5000,
};

/** Scene 1 holds a clip trimmed to 1.0 s..3.0 s at 1.5x: 1.33 s of play in a 2 s scene. */
const VIDEO_DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		...DOCUMENT.project,
		assets: [CLIP],
		scenes: [
			{
				id: "v",
				durationMs: 2000,
				blocks: [
					{
						id: "clip",
						kind: "video",
						assetId: "asset-clip",
						fit: "cover",
						focalPoint: { x: 0.6, y: 0.5 },
						borderRadius: 32,
						trim: { startMs: 1000, endMs: 3000 },
						playbackRate: 1.5,
						muted: true,
						opacity: 1,
						placement: { x: 0.1, y: 0.1, width: 0.5, height: 0.8 },
					},
				],
			},
			{ id: "c", durationMs: 1000, blocks: [code("c::code")] },
		],
	},
};

describe("compositionPlanFor with a video layer", () => {
	const plan = compositionPlanFor(
		{ document: VIDEO_DOCUMENT, images: [], videos: [] },
		{ width: 1920, fps: 60, loop: false },
	);

	it("asks for the source time the preview seeks to, held at the trim's end", () => {
		const requests = plan.videoRequests(plan.totalFrames);
		const at = (frame: number) => requests.find((request) => request.frame === frame);
		// (t - sceneStart) * rate + trimIn, in seconds.
		expect(at(0)).toEqual({ blockId: "clip", assetId: "asset-clip", frame: 0, seconds: 1 });
		expect(at(40)?.seconds).toBe(2);
		expect(at(7)?.seconds).toBe(1.175);
		// Past 1.33 s of scene time the clip has played to its trim-out and holds.
		expect(at(100)?.seconds).toBe(3);
		expect(at(119)?.seconds).toBe(3);
		// The code scene shows no clip.
		expect(at(120)).toBeUndefined();
		expect(requests.map((request) => request.frame)).toEqual(
			Array.from({ length: 120 }, (_, frame) => frame),
		);
	});

	it("draws the decoded frame like an image: the focal crop, the rounded box", () => {
		const frame = { label: "frame 30" };
		const layers = plan.layersAt(0, new Map([["clip", frame]]));
		expect(layers.under).toEqual([]);
		expect(layers.over).toHaveLength(1);
		const [clip] = layers.over;
		expect(clip).toMatchObject({
			kind: "image",
			image: frame,
			radius: 32,
			opacity: 1,
			box: { x: 192, y: 108, width: 960, height: 864 },
		});
		// Cover scales 1920x1080 to 1536x864, a 1200 px wide crop of the source
		// centred on x = 1152 (60 %): it starts at 552 source px, -441.6 in the box.
		expect(clip?.kind === "image" && clip.media).toEqual({
			x: expect.closeTo(-441.6, 5),
			y: 0,
			width: 1536,
			height: 864,
		});
	});

	it("leaves a clip out of a frame it has no decoded picture for", () => {
		expect(plan.layersAt(0).over).toEqual([]);
	});
});

describe("textFontStacks", () => {
	it("names every face a text layer is set in, once", () => {
		expect(textFontStacks(DOCUMENT)).toEqual(["Geist, ui-sans-serif, system-ui, sans-serif"]);
	});
});

describe("sceneInputFor", () => {
	it("carries the caption budget to the painter's card", () => {
		const job = {
			plan: {
				frames: [{ tokens: [], lineCount: 1 }],
				transitions: [],
				typing: [],
			} as unknown as MagicMovePlan,
			durations: [1000],
			firstCode: "",
			focus: [[]],
			width: 1920,
			height: 1080,
			fps: 60,
			format: "mp4",
			transitionMs: 650,
			transitionEasing: DEFAULT_TRANSITION_EASING,
			loop: false,
			typewriter: false,
			focusZoom: false,
			theme: {
				background: "#0d1117",
				foreground: "#e6edf3",
				fontFamily: "monospace",
				fontSize: 14,
				borderRadius: 12,
			},
			title: "t",
			background: "#101014",
			chrome: "macos",
			padding: 24,
			cardMargin: 32,
			showLineNumbers: true,
			lineNumberStart: 1,
			progress: null,
			watermark: null,
			documentCharWidthRatio: 0.6,
			hasCaption: true,
		} satisfies ClientExportJob;
		const input = sceneInputFor(job, 0.6, { grain: null, backdropImage: null });
		expect(input.hasCaption).toBe(true);
	});
});
