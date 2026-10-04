import { Asset } from "@/domain/entities/asset";
import { describe, expect, it } from "vitest";

describe("Asset", () => {
	it("creates serializable image metadata without embedding bytes", () => {
		const asset = Asset.create({
			id: "asset-image",
			kind: "image",
			fileName: "hero.png",
			mimeType: "image/png",
			byteSize: 42_000,
			checksum: "sha256:image",
			width: 1600,
			height: 900,
		});

		expect(asset.id).toBe("asset-image");
		expect(asset.kind).toBe("image");
		expect(asset.metadata).toEqual({
			kind: "image",
			fileName: "hero.png",
			mimeType: "image/png",
			byteSize: 42_000,
			checksum: "sha256:image",
			width: 1600,
			height: 900,
		});
		expect("bytes" in asset).toBe(false);
		expect("bytes" in asset.metadata).toBe(false);
	});

	it("captures video and audio duration metadata", () => {
		const video = Asset.create({
			kind: "video",
			fileName: "demo.mp4",
			mimeType: "video/mp4",
			byteSize: 8_000_000,
			checksum: "sha256:video",
			width: 1920,
			height: 1080,
			durationMs: 12_500,
		});
		const audio = Asset.create({
			kind: "audio",
			fileName: "voiceover.wav",
			mimeType: "audio/wav",
			byteSize: 960_000,
			checksum: "sha256:audio",
			durationMs: 5_000,
		});

		expect(video.id).toBeDefined();
		expect(video.metadata).toMatchObject({
			kind: "video",
			width: 1920,
			height: 1080,
			durationMs: 12_500,
		});
		expect(audio.metadata).toMatchObject({ kind: "audio", durationMs: 5_000 });
	});

	it("rejects incomplete or contradictory common metadata", () => {
		expect(() =>
			Asset.create({
				kind: "image",
				fileName: " ",
				mimeType: "image/png",
				byteSize: 1,
				checksum: "sha256:image",
				width: 1,
				height: 1,
			}),
		).toThrow("Asset file name must not be empty");
		expect(() =>
			Asset.create({
				kind: "image",
				fileName: "hero.png",
				mimeType: "video/mp4",
				byteSize: 1,
				checksum: "sha256:image",
				width: 1,
				height: 1,
			}),
		).toThrow("Image asset MIME type must start with image/");
		expect(() =>
			Asset.create({
				kind: "audio",
				fileName: "silence.wav",
				mimeType: "audio/wav",
				byteSize: 0,
				checksum: "sha256:audio",
				durationMs: 1,
			}),
		).toThrow("Asset byte size must be a positive integer");
		expect(() =>
			Asset.create({
				id: " ",
				kind: "audio",
				fileName: "silence.wav",
				mimeType: "audio/wav",
				byteSize: 1,
				checksum: "sha256:audio",
				durationMs: 1,
			}),
		).toThrow("Asset id must not be empty");
		expect(() =>
			Asset.create({
				kind: "audio",
				fileName: "silence.wav",
				mimeType: "audio/wav",
				byteSize: 1,
				checksum: " ",
				durationMs: 1,
			}),
		).toThrow("Asset checksum must not be empty");
		expect(() =>
			Asset.create({
				kind: "image",
				fileName: "unsafe.svg",
				mimeType: "image/svg+xml",
				byteSize: 1,
				checksum: "sha256:svg",
				width: 1,
				height: 1,
			}),
		).toThrow("SVG assets are not supported");
	});

	it("rejects invalid media-specific measurements", () => {
		expect(() =>
			Asset.create({
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 1,
				checksum: "sha256:image",
				width: 0,
				height: 900,
			}),
		).toThrow("Image dimensions must be positive integers");
		expect(() =>
			Asset.create({
				kind: "video",
				fileName: "demo.mp4",
				mimeType: "video/mp4",
				byteSize: 1,
				checksum: "sha256:video",
				width: 1920,
				height: 1080,
				durationMs: -1,
			}),
		).toThrow("Video duration must be a positive integer");
		expect(() =>
			Asset.create({
				kind: "audio",
				fileName: "voiceover.wav",
				mimeType: "audio/wav",
				byteSize: 1,
				checksum: "sha256:audio",
				durationMs: 1.5,
			}),
		).toThrow("Audio duration must be a positive integer");
	});

	it("defensively freezes its metadata", () => {
		const asset = Asset.create({
			kind: "image",
			fileName: "hero.png",
			mimeType: "image/png",
			byteSize: 42_000,
			checksum: "sha256:image",
			width: 1600,
			height: 900,
		});

		expect(Object.isFrozen(asset)).toBe(true);
		expect(Object.isFrozen(asset.metadata)).toBe(true);
		expect(() => {
			// Runtime immutability matters at JSON/import seams, not only TypeScript readonly fields.
			(asset.metadata as { width: number }).width = 1;
		}).toThrow();
		expect(asset.metadata).toMatchObject({ width: 1600 });
	});
});
