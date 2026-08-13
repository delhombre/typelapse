import { describe, expect, it } from "vitest";
import {
	GIF_MAX_EDGE,
	GIF_MAX_FPS,
	gifFilterOverride,
	outputSettingsFor,
	safeFormat,
} from "../../server/remotion/output-settings";

describe("safeFormat", () => {
	it("keeps the three formats the route renders", () => {
		expect(safeFormat("mp4")).toBe("mp4");
		expect(safeFormat("webm")).toBe("webm");
		expect(safeFormat("gif")).toBe("gif");
	});

	it("falls back to mp4 for anything else", () => {
		expect(safeFormat("../../etc/passwd")).toBe("mp4");
		expect(safeFormat(undefined)).toBe("mp4");
		expect(safeFormat(7)).toBe("mp4");
	});
});

describe("outputSettingsFor, video", () => {
	it("renders an mp4 at exactly the size and rate it was asked for", () => {
		const output = outputSettingsFor("mp4", 1920, 1080, 60);

		expect(output).toMatchObject({ width: 1920, height: 1080, fps: 60, downscaled: false });
	});

	it("captures video frames as JPEG, which h264 and vp8 subsample anyway", () => {
		expect(outputSettingsFor("mp4", 1920, 1080, 30)).toMatchObject({
			codec: "h264",
			crf: 18,
			imageFormat: "jpeg",
			jpegQuality: 95,
			pixelFormat: "yuv420p",
			mimeType: "video/mp4",
		});
		expect(outputSettingsFor("webm", 1920, 1080, 30)).toMatchObject({
			codec: "vp8",
			crf: 20,
			imageFormat: "jpeg",
		});
	});
});

describe("outputSettingsFor, gif", () => {
	it("brings the long edge inside the GIF budget", () => {
		const output = outputSettingsFor("gif", 1920, 1080, 30);

		expect(output.width).toBe(GIF_MAX_EDGE);
		expect(output.height).toBe(540);
		expect(output.downscaled).toBe(true);
	});

	it("caps the rate rather than spending the file on frames nobody perceives", () => {
		expect(outputSettingsFor("gif", 640, 360, 60).fps).toBe(GIF_MAX_FPS);
		expect(outputSettingsFor("gif", 640, 360, 30).fps).toBe(GIF_MAX_FPS);
	});

	it("leaves a request already inside the budget exactly as it came", () => {
		const output = outputSettingsFor("gif", 720, 540, 20);

		expect(output).toMatchObject({ width: 720, height: 540, fps: 20, downscaled: false });
	});

	/**
	 * The palette is the last thing to touch the pixels, so it must not be handed
	 * a picture that a JPEG has already rung and subsampled.
	 */
	it("captures GIF frames losslessly, and asks for no video-only knobs", () => {
		expect(outputSettingsFor("gif", 720, 540, 20)).toMatchObject({
			codec: "gif",
			crf: undefined,
			imageFormat: "png",
			jpegQuality: undefined,
			pixelFormat: undefined,
			mimeType: "image/gif",
		});
	});
});

describe("gifFilterOverride", () => {
	const REMOTION_DEFAULT = "split[v],palettegen,[v]paletteuse";

	it("replaces the error-diffusion default with a positional dither", () => {
		const patched = gifFilterOverride(["-filter_complex", REMOTION_DEFAULT, "-loop", "0"]);

		expect(patched[1]).toContain("dither=bayer");
		expect(patched[1]).not.toBe(REMOTION_DEFAULT);
	});

	it("touches nothing but the filter", () => {
		const args = ["-i", "in.png", "-filter_complex", REMOTION_DEFAULT, "-y", "out.gif"];

		const patched = gifFilterOverride(args);

		const filterAt = args.indexOf(REMOTION_DEFAULT);
		expect(patched).toHaveLength(args.length);
		expect(patched.filter((_, index) => index !== filterAt)).toEqual(
			args.filter((_, index) => index !== filterAt),
		);
	});

	/** A Remotion upgrade that rewrites its own chain must degrade, not break. */
	it("returns an unrecognised command line unchanged", () => {
		const args = ["-i", "in.png", "-filter_complex", "something,else", "out.gif"];

		expect(gifFilterOverride(args)).toEqual(args);
	});
});
