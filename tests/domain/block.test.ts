import { type Block, CodeBlock, ImageBlock, TextBlock, VideoBlock } from "@/domain/entities/block";
import { describe, expect, it } from "vitest";

describe("Block", () => {
	it("creates a hydrated code block with legacy rendering settings", () => {
		const block = CodeBlock.create({
			id: "code-primary",
			code: "const answer = 42;",
			language: "typescript",
			themeName: "nord",
			fontFamily: "IBM Plex Mono, monospace",
			borderRadius: 16,
			focus: "1",
			chrome: "terminal",
			showLineNumbers: false,
			lineNumberStart: 7,
			framePadding: 40,
			cardMargin: 48,
			continuityKey: "primary-code",
			placement: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
			opacity: 0.75,
		});

		expect(block).toMatchObject({
			id: "code-primary",
			kind: "code",
			code: "const answer = 42;",
			language: "typescript",
			themeName: "nord",
			fontFamily: "IBM Plex Mono, monospace",
			borderRadius: 16,
			focus: "1",
			chrome: "terminal",
			showLineNumbers: false,
			lineNumberStart: 7,
			framePadding: 40,
			cardMargin: 48,
			continuityKey: "primary-code",
			placement: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
			opacity: 0.75,
		});
	});

	it("provides deterministic code defaults for a full-canvas layer", () => {
		const block = CodeBlock.create({ code: "print('hello')", language: "python" });

		expect(block.id).toBeDefined();
		expect(block.placement).toEqual({ x: 0, y: 0, width: 1, height: 1 });
		expect(block.opacity).toBe(1);
		expect(block.continuityKey).toBeUndefined();
		expect(block).toMatchObject({
			themeName: "midnight",
			fontFamily: "JetBrains Mono, monospace",
			borderRadius: 12,
			chrome: "macos",
			showLineNumbers: true,
			lineNumberStart: 1,
			framePadding: 24,
			cardMargin: 32,
		});
	});

	it("creates a text block with explicit typography", () => {
		const block = TextBlock.create({
			text: "Ship the idea",
			typography: {
				fontFamily: "Inter",
				fontSize: 72,
				fontWeight: 700,
				color: "#f8fafc",
				align: "center",
			},
		});

		expect(block.kind).toBe("text");
		expect(block.text).toBe("Ship the idea");
		expect(block.typography).toEqual({
			fontFamily: "Inter",
			fontSize: 72,
			fontWeight: 700,
			color: "#f8fafc",
			align: "center",
		});
	});

	it("creates image and video blocks that reference assets without carrying bytes", () => {
		const image = ImageBlock.create({
			assetId: "asset-image",
			fit: "contain",
			focalPoint: { x: 0.25, y: 0.75 },
		});
		const video = VideoBlock.create({
			assetId: "asset-video",
			trim: { startMs: 100, endMs: 2_500 },
		});

		expect(image).toMatchObject({
			kind: "image",
			assetId: "asset-image",
			fit: "contain",
			focalPoint: { x: 0.25, y: 0.75 },
			borderRadius: 0,
		});
		expect(video).toMatchObject({
			kind: "video",
			assetId: "asset-video",
			fit: "cover",
			focalPoint: { x: 0.5, y: 0.5 },
			trim: { startMs: 100, endMs: 2_500 },
			playbackRate: 1,
			muted: true,
		});
		expect("bytes" in image).toBe(false);
		expect("bytes" in video).toBe(false);
	});

	it("is a discriminated union at the public seam", () => {
		function authoredContent(block: Block): string {
			switch (block.kind) {
				case "code":
					return block.code;
				case "text":
					return block.text;
				case "image":
				case "video":
					return block.assetId;
			}
		}

		expect(authoredContent(CodeBlock.create({ code: "x", language: "text" }))).toBe("x");
		expect(
			authoredContent(
				TextBlock.create({
					text: "hello",
					typography: {
						fontFamily: "Inter",
						fontSize: 16,
						fontWeight: 400,
						color: "#fff",
						align: "left",
					},
				}),
			),
		).toBe("hello");
	});

	it("rejects invalid normalized placement, opacity and continuity", () => {
		expect(() =>
			CodeBlock.create({
				code: "x",
				language: "text",
				placement: { x: 0.5, y: 0, width: 0.6, height: 1 },
			}),
		).toThrow("Block placement must stay inside the normalized canvas");
		expect(() => CodeBlock.create({ code: "x", language: "text", opacity: 1.1 })).toThrow(
			"Block opacity must be between 0 and 1",
		);
		expect(() => CodeBlock.create({ code: "x", language: "text", continuityKey: " " })).toThrow(
			"Block continuity key must not be empty",
		);
	});

	it("rejects invalid type-specific content", () => {
		expect(() => CodeBlock.create({ code: " ", language: "typescript" })).toThrow(
			"Code block code must not be empty",
		);
		expect(() =>
			TextBlock.create({
				text: " ",
				typography: {
					fontFamily: "Inter",
					fontSize: 72,
					fontWeight: 700,
					color: "#fff",
					align: "center",
				},
			}),
		).toThrow("Text block text must not be empty");
		expect(() => ImageBlock.create({ assetId: " " })).toThrow(
			"Image block asset id must not be empty",
		);
		expect(() => ImageBlock.create({ assetId: "image", borderRadius: 161 })).toThrow(
			"Media border radius must be between 0 and 160",
		);
		expect(() =>
			VideoBlock.create({
				assetId: "video",
				focalPoint: { x: -0.1, y: 0.5 },
				trim: { startMs: 0, endMs: 1 },
			}),
		).toThrow("Media focal point must be between 0 and 1");
		expect(() => VideoBlock.create({ assetId: "video", trim: { startMs: 10, endMs: 10 } })).toThrow(
			"Video trim must have a non-negative start before its end",
		);
		expect(() =>
			VideoBlock.create({
				assetId: "video",
				trim: { startMs: 0, endMs: 1 },
				playbackRate: 0,
			}),
		).toThrow("Video playback rate must be positive");
	});

	it("freezes nested value objects as well as the block", () => {
		const block = ImageBlock.create({
			assetId: "asset-image",
			placement: { x: 0, y: 0, width: 1, height: 1 },
			focalPoint: { x: 0.5, y: 0.5 },
		});

		expect(Object.isFrozen(block)).toBe(true);
		expect(Object.isFrozen(block.placement)).toBe(true);
		expect(Object.isFrozen(block.focalPoint)).toBe(true);
	});
});
