// @vitest-environment jsdom
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import {
	MultimediaSceneFrame,
	type SceneAssetSource,
} from "@/presentation/components/multimedia/multimedia-scene-frame";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function document(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Launch story",
			canvas: { width: 1920, height: 1080, background: "#f5f3ef" },
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
					fileName: "portrait.jpg",
					mimeType: "image/jpeg",
					byteSize: 1_024,
					checksum: "sha256:image",
					width: 1200,
					height: 800,
				},
				{
					id: "video-1",
					kind: "video",
					fileName: "demo.mp4",
					mimeType: "video/mp4",
					byteSize: 2_048,
					checksum: "sha256:video",
					width: 1920,
					height: 1080,
					durationMs: 4_000,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 2_000,
					blocks: [
						{
							id: "image-block",
							kind: "image",
							opacity: 0.8,
							placement: { x: 0, y: 0, width: 0.5, height: 1 },
							assetId: "image-1",
							fit: "cover",
							focalPoint: { x: 0.25, y: 0.75 },
							borderRadius: 24,
						},
						{
							id: "title-block",
							kind: "text",
							opacity: 1,
							placement: { x: 0.55, y: 0.2, width: 0.4, height: 0.3 },
							text: "One scene. Any medium.",
							typography: {
								fontFamily: "Geist, sans-serif",
								fontSize: 72,
								fontWeight: 650,
								color: "#1c1b19",
								align: "left",
							},
						},
						{
							id: "video-block",
							kind: "video",
							opacity: 1,
							placement: { x: 0.55, y: 0.56, width: 0.4, height: 0.28 },
							assetId: "video-1",
							fit: "contain",
							focalPoint: { x: 0.5, y: 0.5 },
							trim: { startMs: 500, endMs: 3_000 },
							playbackRate: 1,
							muted: true,
						},
					],
				},
			],
		},
	};
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MultimediaSceneFrame", () => {
	it("renders one ordered scene stack with normalized geometry", () => {
		const project = document();
		const frame = compileSceneTimeline({ document: project, fps: 30 }).frameAt(15);
		const resolveAsset = vi.fn((assetId: string): SceneAssetSource | null => ({
			assetId,
			src: `blob:${assetId}`,
		}));

		const { container } = render(
			<MultimediaSceneFrame document={project} frame={frame} resolveAsset={resolveAsset} />,
		);

		const layers = [...container.querySelectorAll("[data-scene-layer]")];
		expect(layers.map((node) => node.getAttribute("data-block-id"))).toEqual([
			"image-block",
			"title-block",
			"video-block",
		]);
		expect((layers[0] as HTMLElement).style.left).toBe("0%");
		expect((layers[0] as HTMLElement).style.width).toBe("50%");
		expect((layers[0] as HTMLElement).style.opacity).toBe("0.8");
		expect((layers[0] as HTMLElement).style.borderRadius).toBe("24px");
		expect(screen.getByText("One scene. Any medium.")).toBeTruthy();
		expect(resolveAsset).toHaveBeenCalledWith("image-1");
		expect(resolveAsset).toHaveBeenCalledWith("video-1");

		const image = container.querySelector("img");
		expect(image?.style.left).toBe("0px");
		expect(image?.style.top).toBe("0px");
		expect(image?.style.width).toBe("1620px");
		expect(image?.style.height).toBe("1080px");
		expect(image?.style.objectFit).toBe("");
		const video = container.querySelector("video");
		expect(video?.dataset.sourceTimeMs).toBe("1000");
		expect(video?.muted).toBe(true);
		expect(Number.parseFloat(video?.style.left ?? "")).toBeCloseTo(115.2);
		expect(video?.style.width).toBe("537.6px");
	});

	it("renders text and code from the same canonical visual projections as Remotion", () => {
		const project = document();
		project.project.scenes[0]?.blocks.push({
			id: "code-block",
			kind: "code",
			opacity: 0.75,
			placement: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
			code: "const parity = true;",
			language: "typescript",
			themeName: "frost",
			fontFamily: "Berkeley Mono",
			borderRadius: 20,
			chrome: "browser",
			showLineNumbers: true,
			lineNumberStart: 4,
			framePadding: 36,
			cardMargin: 32,
		});
		const frame = compileSceneTimeline({ document: project, fps: 30 }).frameAt(0);
		const { container } = render(
			<MultimediaSceneFrame
				document={project}
				frame={frame}
				resolveAsset={(assetId) => ({ assetId, src: `blob:${assetId}` })}
			/>,
		);

		const text = container.querySelector<HTMLElement>("[data-text-layer]");
		expect(text?.style.lineHeight).toBe("1.08");
		expect(text?.style.letterSpacing).toBe("-0.035em");
		expect(text?.style.justifyContent).toBe("flex-start");

		const code = container.querySelector<HTMLElement>("[data-code-layer]");
		expect(
			container.querySelector<HTMLElement>("[data-block-id='code-block']")?.style.opacity,
		).toBe("0.75");
		expect(code?.style.background).toBe("rgb(240, 244, 248)");
		expect(code?.style.color).toBe("rgb(26, 32, 44)");
		expect(code?.style.borderRadius).toBe("20px");
		expect(code?.style.boxShadow).toContain("0 24px 64px");
		expect(code?.querySelector("pre")?.style.fontSize).toBe("18px");
		expect(code?.querySelector("pre")?.getAttribute("data-language")).toBe("typescript");
		expect(screen.getByText("Launch story")).toBeTruthy();
		expect(screen.getByText("4")).toBeTruthy();
	});

	it("exposes missing private media without inventing or persisting a URL", () => {
		const project = document();
		const frame = compileSceneTimeline({ document: project, fps: 30 }).frameAt(0);

		const { container } = render(
			<MultimediaSceneFrame document={project} frame={frame} resolveAsset={() => null} />,
		);

		expect(container.querySelectorAll("[data-missing-asset]")).toHaveLength(2);
		expect(container.innerHTML).not.toContain("http://");
		expect(container.innerHTML).not.toContain("https://");
	});

	it("delegates media and code rendering while keeping shared geometry", () => {
		const parsed = document();
		const codeBlock: ProjectDocumentV2["project"]["scenes"][number]["blocks"][number] = {
			id: "code-block",
			kind: "code",
			opacity: 1,
			placement: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
			code: "const medium = 'code';",
			language: "typescript",
			themeName: "midnight",
			chrome: "terminal",
			showLineNumbers: true,
			lineNumberStart: 1,
			framePadding: 24,
			cardMargin: 32,
		};
		parsed.project.scenes[0]?.blocks.push(codeBlock);
		const frame = compileSceneTimeline({ document: parsed, fps: 30 }).frameAt(0);
		const renderCode = vi.fn(({ layer }: { layer: { blockId: string } }) => (
			<span>custom code {layer.blockId}</span>
		));

		render(
			<MultimediaSceneFrame
				document={parsed}
				frame={frame}
				resolveAsset={(assetId) => ({ assetId, src: `blob:${assetId}` })}
				renderCode={renderCode}
			/>,
		);

		expect(screen.getByText("custom code code-block")).toBeTruthy();
		expect(renderCode).toHaveBeenCalledOnce();
	});

	it("offers controlled layer selection only when the editor asks for it", () => {
		const project = document();
		const frame = compileSceneTimeline({ document: project, fps: 30 }).frameAt(0);
		const onSelectLayer = vi.fn();
		const { container } = render(
			<MultimediaSceneFrame
				document={project}
				frame={frame}
				resolveAsset={(assetId) => ({ assetId, src: `blob:${assetId}` })}
				selectedBlockId="title-block"
				onSelectLayer={onSelectLayer}
			/>,
		);

		const title = container.querySelector<HTMLElement>("[data-block-id='title-block']");
		expect(title?.getAttribute("role")).toBe("button");
		expect(title?.getAttribute("data-selected")).toBe("");
		if (!title) {
			throw new Error("Expected title layer");
		}
		fireEvent.click(title);
		fireEvent.keyDown(title, { key: "Enter" });
		expect(onSelectLayer).toHaveBeenNthCalledWith(1, "scene-1", "title-block");
		expect(onSelectLayer).toHaveBeenNthCalledWith(2, "scene-1", "title-block");
	});

	it("plays embedded video only while the user-driven preview is running", () => {
		vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
		const play = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockImplementation(async () => undefined);
		const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		const project = document();
		const videoBlock = project.project.scenes[0]?.blocks.find((block) => block.kind === "video");
		if (!videoBlock || videoBlock.kind !== "video") {
			throw new Error("Expected video block");
		}
		videoBlock.playbackRate = 2;
		const frame = compileSceneTimeline({ document: project, fps: 30 }).frameAt(0);
		const view = render(
			<MultimediaSceneFrame
				document={project}
				frame={frame}
				playing
				resolveAsset={(assetId) => ({ assetId, src: `blob:${assetId}` })}
			/>,
		);

		expect(play).toHaveBeenCalledOnce();
		expect(view.container.querySelector("video")?.playbackRate).toBe(2);
		view.rerender(
			<MultimediaSceneFrame
				document={project}
				frame={frame}
				playing={false}
				resolveAsset={(assetId) => ({ assetId, src: `blob:${assetId}` })}
			/>,
		);
		expect(pause).toHaveBeenCalled();
	});
});
