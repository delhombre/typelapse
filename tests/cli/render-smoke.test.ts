// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	type ProbeSummary,
	SMOKE,
	judgeClip,
	parseProbe,
	smokeProject,
	summaryLine,
} from "../../cli/render-smoke";
import { TEMPLATE_CATALOG } from "../../src/application/templates/catalog";

/**
 * The gate renders one clip through the Remotion path and measures the file
 * with ffprobe. The render itself is slow and lives in `pnpm render:smoke`;
 * what is pinned here is the part that decides pass or fail: the clip that is
 * asked for, how a probe is read, and what makes a file a failure.
 */

const PROBE = JSON.stringify({
	streams: [
		{
			codec_name: "h264",
			codec_type: "video",
			width: 640,
			height: 360,
			avg_frame_rate: "30/1",
			nb_frames: "60",
		},
	],
	format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2.000000", size: "41203" },
});

const HEALTHY: ProbeSummary = {
	file: "/tmp/typelapse-smoke-x/smoke.mp4",
	codec: "h264",
	width: 640,
	height: 360,
	fps: 30,
	frames: 60,
	durationSeconds: 2,
	sizeBytes: 41203,
};

describe("smokeProject", () => {
	it("is the smallest template, cut to two scenes that add up to the clip's length", () => {
		const project = smokeProject(TEMPLATE_CATALOG);

		expect(project.steps).toHaveLength(2);
		const holds = project.steps.reduce((total, step) => total + step.duration, 0);
		expect((holds + (project.transitionMs ?? 0)) / 1000).toBe(SMOKE.seconds);
		expect(project.width).toBe(SMOKE.width);
		expect(project.height).toBe(SMOKE.height);
		const totals = TEMPLATE_CATALOG.map((template) =>
			template.project.steps.slice(0, 2).reduce((sum, step) => sum + step.code.length, 0),
		);
		const chosen = project.steps.reduce((sum, step) => sum + step.code.length, 0);
		expect(chosen).toBe(Math.min(...totals));
	});
});

describe("parseProbe", () => {
	it("reads the video stream and the container", () => {
		expect(parseProbe(PROBE, HEALTHY.file)).toEqual(HEALTHY);
	});

	it("refuses a file with no video stream", () => {
		const audioOnly = JSON.stringify({ streams: [{ codec_type: "audio" }], format: {} });

		expect(() => parseProbe(audioOnly, HEALTHY.file)).toThrow(/no video stream/);
	});

	it("refuses output that is not JSON", () => {
		expect(() => parseProbe("", HEALTHY.file)).toThrow(/ffprobe/);
	});
});

describe("judgeClip", () => {
	it("passes the clip that was asked for", () => {
		expect(judgeClip(HEALTHY)).toEqual([]);
	});

	it("fails an empty file", () => {
		expect(judgeClip({ ...HEALTHY, sizeBytes: 0 })).toEqual([expect.stringMatching(/empty/)]);
	});

	it("fails a silent resize, because a clamp that kept the file valid still lies", () => {
		expect(judgeClip({ ...HEALTHY, width: 320, height: 180 })).toEqual([
			expect.stringMatching(/320x180.*640x360/),
		]);
	});

	it("fails a codec other than h264", () => {
		expect(judgeClip({ ...HEALTHY, codec: "vp9" })).toEqual([expect.stringMatching(/vp9/)]);
	});

	it("fails a frame rate other than the one asked, which doubles the frames while the file stays valid", () => {
		expect(judgeClip({ ...HEALTHY, fps: 60, frames: 120 })).toEqual([
			expect.stringMatching(/60 fps.*30 fps/),
			expect.stringMatching(/120 frames.*60/),
		]);
	});

	it("fails a frame count that is not fps times seconds, give or take one", () => {
		expect(judgeClip({ ...HEALTHY, frames: 59 })).toEqual([]);
		expect(judgeClip({ ...HEALTHY, frames: 61 })).toEqual([]);
		expect(judgeClip({ ...HEALTHY, frames: 45 })).toEqual([expect.stringMatching(/45 frames.*60/)]);
	});

	it("fails a clip whose length is far from the two seconds asked", () => {
		expect(judgeClip({ ...HEALTHY, durationSeconds: 0.2 })).toEqual([
			expect.stringMatching(/0\.20s/),
		]);
		expect(judgeClip({ ...HEALTHY, durationSeconds: 2.1 })).toEqual([]);
	});
});

describe("summaryLine", () => {
	it("is one line that names the file, the length, the size, the codec and the resolution", () => {
		const line = summaryLine(HEALTHY, 9800);

		expect(line).not.toContain("\n");
		expect(line).toBe(
			"render-smoke OK: /tmp/typelapse-smoke-x/smoke.mp4 | 2.00s | 40.2 KB | h264 | 640x360 | 30 fps | 60 frames | rendered in 9.8s",
		);
	});
});
