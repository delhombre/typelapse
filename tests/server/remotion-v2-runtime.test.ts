import { describe, expect, it } from "vitest";
import {
	type RemotionV2RuntimeApiPort,
	createRemotionV2Runtime,
} from "../../server/render/v2/remotion-v2-renderer";

describe("Remotion V2 runtime", () => {
	it("maps an MP4 render and cancels Remotion when the worker signal aborts", async () => {
		let renderInput: Parameters<RemotionV2RuntimeApiPort["renderMedia"]>[0] | null = null;
		let canceled = false;
		const api: RemotionV2RuntimeApiPort = {
			bundle: async () => "http://remotion.invalid/bundle",
			selectComposition: async () => ({ id: "TypelapseV2" }),
			renderMedia: async (input) => {
				renderInput = input;
				await new Promise<void>((_resolve, reject) => {
					input.cancelSignal(() => {
						canceled = true;
						reject(new Error("Remotion render canceled"));
					});
				});
			},
		};
		const runtime = createRemotionV2Runtime(api);
		const abort = new AbortController();
		const rendering = runtime.renderMedia({
			serveUrl: "http://remotion.invalid/bundle",
			composition: { id: "TypelapseV2" },
			inputProps: {
				input: {
					document: {} as never,
					assetSources: [],
					includeAudio: true,
				},
			},
			outputPath: "/safe/job/output.mp4",
			format: "mp4",
			width: 1280,
			height: 720,
			fps: 30,
			durationInFrames: 15,
			includeAudio: true,
			signal: abort.signal,
		});

		abort.abort(new Error("lease lost"));

		await expect(rendering).rejects.toThrow("Remotion render canceled");
		expect(canceled).toBe(true);
		expect(renderInput).toMatchObject({
			serveUrl: "http://remotion.invalid/bundle",
			codec: "h264",
			outputLocation: "/safe/job/output.mp4",
			composition: {
				id: "TypelapseV2",
				width: 1280,
				height: 720,
				fps: 30,
				durationInFrames: 15,
			},
			muted: false,
			colorSpace: "bt709",
			// V1 captures at 95 too: Remotion's default 80 softens the text the file sells.
			imageFormat: "jpeg",
			jpegQuality: 95,
		});
		expect(
			// The callback assigns it, which TypeScript's narrowing cannot see.
			(renderInput as Parameters<RemotionV2RuntimeApiPort["renderMedia"]>[0] | null)?.ffmpegOverride({
				type: "pre-stitcher",
				args: ["-vf", "zscale=matrix=709:matrixin=709:range=limited"],
			}),
		).toEqual([
			"-vf",
			"zscale=matrixin=470bg:rangein=full:primariesin=709:transferin=709:matrix=709:range=limited:primaries=709:transfer=709",
		]);
	});
});
