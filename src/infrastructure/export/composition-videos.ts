/**
 * The videos a studio project's layers show, decoded in the render worker.
 *
 * The preview seeks a `<video>` to each layer's source time. Seeking an element
 * per export frame works (the #94 spike read the right frame every time) but it
 * is bound to the tab's main thread and ran four to nine times slower than
 * decoding in the worker. So the tab hands the worker the files (a `Blob` clones
 * by reference), mediabunny demuxes them there, and WebCodecs decodes each
 * packet once: the whole schedule of source times is known before the first
 * frame, so the decoder walks it in order instead of seeking.
 *
 * Which frame: the last one whose timestamp is at or before the source time,
 * which is what a `<video>` shows after a seek and what
 * `VideoSampleSink.samplesAtTimestamps` returns. Held at the trim's end by the
 * scene compiler, and at the clip's last frame by the decoder.
 */

import { undecodableVideoRefusal } from "@/application/export/device-export-refusal";
import type { PaintImage } from "@/application/frame-painter/paint-context";
import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import type { ClientExportVideo } from "./client-export-job";
import type { VideoFrameRequest } from "./client-export-scene";

/**
 * The file of every video a layer shows, read in the tab that owns the asset
 * store. A video this browser does not have refuses the export with the same
 * sentence an image does, before anything is posted.
 */
export async function loadCompositionVideos(
	document: ProjectDocumentV2,
	library: Pick<LocalProjectLibraryPort, "loadAsset">,
): Promise<ClientExportVideo[]> {
	const shown = new Set<string>();
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "video") {
				shown.add(block.assetId);
			}
		}
	}
	const assets = document.project.assets.filter(
		(asset) => asset.kind === "video" && shown.has(asset.id),
	);
	return await Promise.all(
		assets.map(async (asset) => {
			const content = await library.loadAsset({
				projectId: document.project.id,
				assetId: asset.id,
			});
			if (!content || !(content.opaqueHandle instanceof Blob)) {
				throw new Error(`${asset.fileName} is unavailable on this device.`);
			}
			return { assetId: asset.id, blob: content.opaqueHandle };
		}),
	);
}

/** What the worker needs of a decoded frame: mediabunny's `VideoSample`. */
export interface VideoSampleLike {
	readonly timestamp: number;
	drawWithFit(context: OffscreenCanvasRenderingContext2D, options: { fit: "fill" }): void;
	close(): void;
}

/** A video track this browser can decode. */
export interface OpenedVideo {
	/** Display size, after rotation: the size the asset metadata and the preview use. */
	readonly width: number;
	readonly height: number;
	/** The first frame's timestamp, in seconds; a `<video>` shows that frame before it. */
	readonly firstTimestamp: number;
	/** One sample per timestamp, in order, decoding each packet at most once. */
	samplesAt(timestamps: number[]): AsyncIterator<VideoSampleLike | null>;
	dispose(): void;
}

/** Null when the file has no video track this browser can decode. */
export type OpenVideo = (blob: Blob) => Promise<OpenedVideo | null>;

/** A canvas a layer's current frame is drawn into, and the image the painter draws. */
export type MakeSurface = (
	width: number,
	height: number,
) => { ctx: OffscreenCanvasRenderingContext2D; image: PaintImage };

export interface CompositionVideoFrames {
	/**
	 * Each video layer's picture at this export frame, by block id. Frames are
	 * asked for in increasing order, as the encoder paints them.
	 */
	framesAt(frame: number): Promise<ReadonlyMap<string, PaintImage>>;
	close(): void;
}

interface LayerCursor {
	frames: number[];
	next: number;
	samples: AsyncIterator<VideoSampleLike | null>;
	surface: ReturnType<MakeSurface>;
	drawnTimestamp: number | null;
}

/**
 * Open every video the requests name and line up its decoder on the schedule.
 * A codec this browser cannot decode refuses here, naming the file, before the
 * first frame is painted.
 */
export async function openCompositionVideos(
	document: ProjectDocumentV2,
	videos: ClientExportVideo[],
	requests: VideoFrameRequest[],
	deps: { open: OpenVideo; surface: MakeSurface } = {
		open: openWithMediabunny,
		surface: offscreenSurface,
	},
): Promise<CompositionVideoFrames> {
	const opened = new Map<string, OpenedVideo>();
	const cursors = new Map<string, LayerCursor>();
	const close = () => {
		for (const cursor of cursors.values()) {
			void cursor.samples.return?.();
		}
		for (const video of opened.values()) {
			video.dispose();
		}
	};

	try {
		for (const assetId of new Set(requests.map((request) => request.assetId))) {
			const fileName =
				document.project.assets.find((asset) => asset.id === assetId)?.fileName ?? assetId;
			const blob = videos.find((video) => video.assetId === assetId)?.blob;
			if (!blob) {
				throw new Error(`${fileName} is unavailable on this device.`);
			}
			const video = await deps.open(blob);
			if (!video) {
				throw new Error(undecodableVideoRefusal(fileName));
			}
			opened.set(assetId, video);
		}

		const byBlock = new Map<string, VideoFrameRequest[]>();
		for (const request of requests) {
			byBlock.set(request.blockId, [...(byBlock.get(request.blockId) ?? []), request]);
		}
		for (const [blockId, schedule] of byBlock) {
			const video = opened.get(schedule[0]?.assetId ?? "");
			if (!video) {
				continue;
			}
			cursors.set(blockId, {
				frames: schedule.map((request) => request.frame),
				next: 0,
				samples: video.samplesAt(
					schedule.map((request) => Math.max(request.seconds, video.firstTimestamp)),
				),
				surface: deps.surface(video.width, video.height),
				drawnTimestamp: null,
			});
		}
	} catch (error) {
		close();
		throw error;
	}

	return {
		async framesAt(frame) {
			const pictures = new Map<string, PaintImage>();
			for (const [blockId, cursor] of cursors) {
				let onFrame = false;
				while (cursor.next < cursor.frames.length && (cursor.frames[cursor.next] ?? 0) <= frame) {
					onFrame = cursor.frames[cursor.next] === frame;
					cursor.next += 1;
					const { value: sample } = await cursor.samples.next();
					if (!sample) {
						continue;
					}
					// A held frame (past the trim-out, or a slow clip at a fast export
					// rate) is already on the surface: drawing it again costs a copy.
					if (sample.timestamp !== cursor.drawnTimestamp) {
						sample.drawWithFit(cursor.surface.ctx, { fit: "fill" });
						cursor.drawnTimestamp = sample.timestamp;
					}
					sample.close();
				}
				if (onFrame && cursor.drawnTimestamp !== null) {
					pictures.set(blockId, cursor.surface.image);
				}
			}
			return pictures;
		},
		close,
	};
}

/** mediabunny reads MP4, MOV, WebM and Matroska; WebCodecs decodes what the browser can. */
const openWithMediabunny: OpenVideo = async (blob) => {
	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) {
			input.dispose();
			return null;
		}
		const firstTimestamp = await track.getFirstTimestamp();
		return {
			width: track.displayWidth,
			height: track.displayHeight,
			firstTimestamp,
			samplesAt: (timestamps) =>
				new VideoSampleSink(track).samplesAtTimestamps(timestamps)[Symbol.asyncIterator](),
			dispose: () => input.dispose(),
		};
	} catch {
		// A file the demuxer cannot parse has no frames to draw either.
		input.dispose();
		return null;
	}
};

/**
 * `drawWithFit` applies the track's rotation, so a phone's portrait clip lands
 * upright at its display size, the size the preview lays out.
 */
const offscreenSurface: MakeSurface = (width, height) => {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("This browser gave the worker no 2D context to draw a video frame into.");
	}
	return { ctx, image: canvas };
};
