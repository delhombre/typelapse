// @vitest-environment jsdom
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { MultimediaAudioPreview } from "@/presentation/components/multimedia/multimedia-audio-preview";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function audioDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Sound story",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "audio-1",
					kind: "audio",
					fileName: "score.mp3",
					mimeType: "audio/mpeg",
					byteSize: 2_048,
					checksum: "a".repeat(64),
					durationMs: 4_000,
				},
			],
			audioCues: [
				{
					id: "cue-1",
					assetId: "audio-1",
					startMs: 0,
					trim: { startMs: 500, endMs: 3_500 },
					gain: 0.6,
					fadeInMs: 0,
					fadeOutMs: 0,
				},
			],
			scenes: [{ id: "scene-1", durationMs: 3_000, blocks: [] }],
		},
	};
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MultimediaAudioPreview", () => {
	it("synchronizes and plays an active authored cue without exposing its URL to the document", () => {
		const play = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockImplementation(async () => undefined);
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		const frame = compileSceneTimeline({ document: audioDocument(), fps: 30 }).frameAt(30);
		const { container } = render(
			<MultimediaAudioPreview
				frame={frame}
				playing
				resolveAsset={(assetId) => ({ assetId, src: "blob:score" })}
			/>,
		);

		const audio = container.querySelector("audio");
		expect(audio?.dataset.audioCue).toBe("cue-1");
		expect(audio?.dataset.sourceTimeMs).toBe("1500");
		expect(audio?.currentTime).toBe(1.5);
		expect(audio?.volume).toBe(0.6);
		expect(play).toHaveBeenCalledOnce();
	});

	it("stays silent when the preview is paused or the private source is unavailable", () => {
		const play = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockImplementation(async () => undefined);
		const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		const frame = compileSceneTimeline({ document: audioDocument(), fps: 30 }).frameAt(0);
		const { container } = render(
			<MultimediaAudioPreview frame={frame} playing={false} resolveAsset={() => null} />,
		);

		expect(container.querySelector("audio")).toBeNull();
		expect(play).not.toHaveBeenCalled();
		expect(pause).not.toHaveBeenCalled();
	});
});
