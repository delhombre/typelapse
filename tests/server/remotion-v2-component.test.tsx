import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2RemotionComposition } from "../../server/remotion/v2/composition";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";
import { proofDocument } from "./remotion-v2-proof-document";
import { useMonospaceCanvas } from "../support/jsdom-gaps";

const currentFrame = vi.hoisted(() => ({ value: 0 }));

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
		delayRender: () => 1,
		continueRender: () => undefined,
		useCurrentFrame: () => currentFrame.value,
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

useMonospaceCanvas();

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

	it("mounts a real video element and no static code layer", () => {
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
		// Without the studio's card in the input, a code block is not drawn at all.
		expect(markup).not.toContain("data-code-layer");
		expect(markup).not.toContain("const rendered = true;");
	});

	it("draws the studio's card between the layer slots, then the mark over everything", async () => {
		const doc = proofDocument();
		const card = await buildCodeCardInput({ document: doc, loop: false });
		if (!card) {
			throw new Error("the proof project has a card");
		}
		currentFrame.value = 15;
		const markup = renderToStaticMarkup(
			React.createElement(V2RemotionComposition, {
				input: {
					document: doc,
					assetSources: [{ assetId: "asset-proof-photo", publicPath: "assets/asset-0.png" }],
					includeAudio: false,
					card,
				},
			}),
		);
		currentFrame.value = 0;

		const photo = markup.indexOf('data-remotion="image"');
		const window = markup.indexOf("data-code-window");
		const mark = markup.lastIndexOf("@typelapse");
		// Scene 1 holds at frame 15: the card is there but hidden, the texts over it.
		expect(window).toBeGreaterThan(-1);
		expect(markup).toContain("opacity:0");
		expect(markup.indexOf("Ship the greeting")).toBeGreaterThan(window);
		expect(mark).toBeGreaterThan(markup.indexOf("in three scenes, on this device"));
		expect(photo).toBe(-1);
		expect(markup).not.toContain("data-code-layer");

		// Scene 2 holds at 2.5 s: the photo, authored before the card, lies under it.
		currentFrame.value = 75;
		const scene2 = renderToStaticMarkup(
			React.createElement(V2RemotionComposition, {
				input: {
					document: doc,
					assetSources: [{ assetId: "asset-proof-photo", publicPath: "assets/asset-0.png" }],
					includeAudio: false,
					card,
				},
			}),
		);
		currentFrame.value = 0;
		expect(scene2.indexOf('data-remotion="image"')).toBeGreaterThan(-1);
		expect(scene2.indexOf('data-remotion="image"')).toBeLessThan(
			scene2.indexOf("data-code-window"),
		);
		expect(scene2).toContain("console.");
	});
});
