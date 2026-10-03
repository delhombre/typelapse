/**
 * The video layers of an on-device export (ticket #94): the files the tab hands
 * the worker, and the decoded picture of each layer at each export frame.
 */

import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { VideoFrameRequest } from "@/infrastructure/export/client-export-scene";
import {
	type OpenedVideo,
	type VideoSampleLike,
	loadCompositionVideos,
	openCompositionVideos,
} from "@/infrastructure/export/composition-videos";
import { describe, expect, it, vi } from "vitest";

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

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "proof",
		title: "Proof",
		canvas: { width: 1920, height: 1080, background: "#101014" },
		settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
		assets: [CLIP, { ...CLIP, id: "asset-unused", fileName: "unused.mp4" }],
		audioCues: [],
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
						focalPoint: { x: 0.5, y: 0.5 },
						trim: { startMs: 1000, endMs: 3000 },
						playbackRate: 1.5,
						muted: true,
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	},
};

const BLOB = new Blob(["mp4"], { type: "video/mp4" });

describe("loadCompositionVideos", () => {
	it("hands over the file of every video a layer shows, and no other", async () => {
		const loadAsset = vi.fn(async () => ({
			assetId: "asset-clip",
			mimeType: "video/mp4",
			byteSize: 3,
			opaqueHandle: BLOB,
		}));
		await expect(loadCompositionVideos(DOCUMENT, { loadAsset })).resolves.toEqual([
			{ assetId: "asset-clip", blob: BLOB },
		]);
		expect(loadAsset).toHaveBeenCalledTimes(1);
		expect(loadAsset).toHaveBeenCalledWith({ projectId: "proof", assetId: "asset-clip" });
	});

	it("refuses, naming the file, when this browser does not have its bytes", async () => {
		await expect(
			loadCompositionVideos(DOCUMENT, { loadAsset: vi.fn(async () => null) }),
		).rejects.toThrow("counter.mp4 is unavailable on this device.");
	});
});

/** A 30 fps clip: each request gets the last frame at or before it, as a decoder would. */
function fakeClip(firstTimestamp = 0) {
	const asked: number[][] = [];
	const drawn: number[] = [];
	const closed: number[] = [];
	const disposed = vi.fn();
	const opened: OpenedVideo = {
		width: 1920,
		height: 1080,
		firstTimestamp,
		samplesAt(timestamps) {
			asked.push([...timestamps]);
			const queue = timestamps.map((seconds): VideoSampleLike => {
				const timestamp = Math.floor(seconds * 30 + 1e-9) / 30;
				return {
					timestamp,
					drawWithFit: () => drawn.push(Math.round(timestamp * 30)),
					close: () => closed.push(Math.round(timestamp * 30)),
				};
			});
			return {
				next: async () =>
					queue.length > 0
						? { done: false, value: queue.shift() as VideoSampleLike }
						: { done: true, value: undefined },
				return: async () => ({ done: true, value: undefined }),
			};
		},
		dispose: disposed,
	};
	return { opened, asked, drawn, closed, disposed };
}

function requestsAt(seconds: number[]): VideoFrameRequest[] {
	return seconds.map((value, frame) => ({
		blockId: "clip",
		assetId: "asset-clip",
		frame,
		seconds: value,
	}));
}

const surface = () => ({ ctx: {} as never, image: { label: "clip surface" } });

describe("openCompositionVideos", () => {
	it("draws each layer's source frame once per change and closes every sample", async () => {
		const clip = fakeClip();
		const videos = await openCompositionVideos(
			DOCUMENT,
			[{ assetId: "asset-clip", blob: BLOB }],
			requestsAt([1, 1.025, 1.05, 3, 3]),
			{ open: async () => clip.opened, surface },
		);

		const seen = [];
		for (let frame = 0; frame < 5; frame++) {
			seen.push((await videos.framesAt(frame)).get("clip"));
		}

		// The whole schedule goes to the decoder up front, in frame order.
		expect(clip.asked).toEqual([[1, 1.025, 1.05, 3, 3]]);
		expect(seen).toEqual(Array(5).fill({ label: "clip surface" }));
		// 1.025 s is still frame 30; the held trim-out is drawn once.
		expect(clip.drawn).toEqual([30, 31, 90]);
		expect(clip.closed).toEqual([30, 30, 31, 90, 90]);

		videos.close();
		expect(clip.disposed).toHaveBeenCalledTimes(1);
	});

	it("asks for the first frame where the preview would show it before the track starts", async () => {
		const clip = fakeClip(0.04);
		await openCompositionVideos(
			DOCUMENT,
			[{ assetId: "asset-clip", blob: BLOB }],
			requestsAt([0, 0.5]),
			{ open: async () => clip.opened, surface },
		);
		expect(clip.asked).toEqual([[0.04, 0.5]]);
	});

	it("shows no picture for a layer on a frame it is not on", async () => {
		const clip = fakeClip();
		const videos = await openCompositionVideos(
			DOCUMENT,
			[{ assetId: "asset-clip", blob: BLOB }],
			[{ blockId: "clip", assetId: "asset-clip", frame: 2, seconds: 1 }],
			{ open: async () => clip.opened, surface },
		);
		expect((await videos.framesAt(0)).has("clip")).toBe(false);
		expect((await videos.framesAt(2)).get("clip")).toEqual({ label: "clip surface" });
		expect((await videos.framesAt(3)).has("clip")).toBe(false);
	});

	it("refuses a codec this browser cannot decode, naming the file, before any frame", async () => {
		await expect(
			openCompositionVideos(DOCUMENT, [{ assetId: "asset-clip", blob: BLOB }], requestsAt([1]), {
				open: async () => null,
				surface,
			}),
		).rejects.toThrow(
			"This browser cannot decode counter.mp4; choose Server under Where to render this project.",
		);
	});
});
