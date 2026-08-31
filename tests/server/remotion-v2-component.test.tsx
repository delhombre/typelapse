import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2RemotionComposition } from "../../server/remotion/v2/composition";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";

vi.mock("remotion", async () => {
	const ReactRuntime = await import("react");
	return {
		AbsoluteFill: ({
			children,
			style,
		}: { children?: React.ReactNode; style?: React.CSSProperties }) =>
			ReactRuntime.createElement("div", { "data-remotion": "fill", style }, children),
		Img: ({ src, style }: { src: string; style?: React.CSSProperties }) =>
			ReactRuntime.createElement("img", { "data-remotion": "image", src, style }),
		OffthreadVideo: ({ src, style }: { src: string; style?: React.CSSProperties }) =>
			ReactRuntime.createElement("video", { "data-remotion": "video", src, style }),
		Audio: ({ src }: { src: string }) =>
			ReactRuntime.createElement("audio", { "data-remotion": "audio", src }),
		Sequence: ({
			children,
			from,
			durationInFrames,
		}: {
			children?: React.ReactNode;
			from?: number;
			durationInFrames?: number;
		}) =>
			ReactRuntime.createElement(
				"div",
				{ "data-remotion": "sequence", "data-from": from, "data-duration": durationInFrames },
				children,
			),
		staticFile: (publicPath: string) => `bundle://${publicPath}`,
		useCurrentFrame: () => 0,
		useVideoConfig: () => ({
			fps: 30,
			width: 1920,
			height: 1080,
			durationInFrames: 30,
		}),
	};
});

function document(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-component",
			title: "Component",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "image-1",
					kind: "image",
					fileName: "safe.png",
					mimeType: "image/png",
					byteSize: 10,
					checksum: "a".repeat(64),
					width: 1600,
					height: 900,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_000,
					blocks: [
						{
							id: "image-block",
							kind: "image",
							assetId: "image-1",
							fit: "contain",
							focalPoint: { x: 0.5, y: 0.5 },
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
						{
							id: "text-block",
							kind: "text",
							text: "Rendered V2 title",
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 0.25 },
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
			],
		},
	};
}

function audioDocument(): ProjectDocumentV2 {
	const base = document();
	return {
		...base,
		project: {
			...base.project,
			id: "project-audio-component",
			assets: [
				{
					id: "audio-1",
					kind: "audio",
					fileName: "safe.wav",
					mimeType: "audio/wav",
					byteSize: 10,
					checksum: "b".repeat(64),
					durationMs: 1_000,
				},
			],
			audioCues: [
				{
					id: "cue-1",
					assetId: "audio-1",
					startMs: 0,
					trim: { startMs: 0, endMs: 1_000 },
					gain: 1,
					fadeInMs: 0,
					fadeOutMs: 0,
				},
			],
			scenes: [],
		},
	};
}

function videoAndCodeDocument(): ProjectDocumentV2 {
	const base = document();
	return {
		...base,
		project: {
			...base.project,
			id: "project-video-component",
			assets: [
				{
					id: "video-1",
					kind: "video",
					fileName: "safe.mp4",
					mimeType: "video/mp4",
					byteSize: 10,
					checksum: "c".repeat(64),
					width: 1920,
					height: 1080,
					durationMs: 1_000,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "scene-video",
					durationMs: 1_000,
					blocks: [
						{
							id: "video-block",
							kind: "video",
							assetId: "video-1",
							fit: "cover",
							focalPoint: { x: 0.5, y: 0.5 },
							trim: { startMs: 0, endMs: 1_000 },
							playbackRate: 1,
							muted: true,
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
						{
							id: "code-block",
							kind: "code",
							code: "const rendered = true;",
							language: "typescript",
							themeName: "midnight",
							chrome: "browser",
							showLineNumbers: true,
							lineNumberStart: 7,
							framePadding: 24,
							cardMargin: 32,
							opacity: 1,
							placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
						},
					],
				},
			],
		},
	};
}

describe("V2 Remotion component", () => {
	it("renders concrete image and text elements from the deterministic plan", () => {
		const markup = renderToStaticMarkup(
			React.createElement(V2RemotionComposition, {
				input: {
					document: document(),
					assetSources: [{ assetId: "image-1", publicPath: "assets/asset-0.png" }],
					includeAudio: true,
				},
			}),
		);

		expect(markup).toContain("Rendered V2 title");
		expect(markup).toContain('data-remotion="image"');
		expect(markup).toContain('src="bundle://assets/asset-0.png"');
	});

	it("mounts the deterministic audio-only track", () => {
		const markup = renderToStaticMarkup(
			React.createElement(V2RemotionComposition, {
				input: {
					document: audioDocument(),
					assetSources: [{ assetId: "audio-1", publicPath: "assets/asset-0.wav" }],
					includeAudio: true,
				},
			}),
		);

		expect(markup).toContain('data-remotion="audio"');
		expect(markup).toContain('src="bundle://assets/asset-0.wav"');
	});

	it("mounts a real video element and a static code layer", () => {
		const markup = renderToStaticMarkup(
			React.createElement(V2RemotionComposition, {
				input: {
					document: videoAndCodeDocument(),
					assetSources: [{ assetId: "video-1", publicPath: "assets/asset-0.mp4" }],
					includeAudio: true,
				},
			}),
		);

		expect(markup).toContain('data-remotion="video"');
		expect(markup).toContain('src="bundle://assets/asset-0.mp4"');
		expect(markup).toContain("const rendered = true;");
		expect(markup).toContain('data-language="typescript"');
		expect(markup).toContain('data-code-theme="midnight"');
		expect(markup).toContain("Component");
		expect(markup).toContain("border-radius:12px");
		expect(markup).toContain('data-code-line-numbers=""');
	});
});
