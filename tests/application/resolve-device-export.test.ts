import { resolveDeviceExport } from "@/application/export/resolve-device-export";
import { ASPECT_LABELS, RESOLUTION_TIERS, dimensionsFor } from "@/domain/entities/render-config";
import { describe, expect, it } from "vitest";

/* Viability D2 and the device-exports-free decision: what runs on the user's
   machine is free. No plan reaches this function, so no plan can clamp the size
   or the rate, or stamp a mark the user did not write. */

const request = (width: number, height: number) => ({
	width,
	height,
	fps: 60,
	format: "mp4" as const,
	userWatermark: "",
});

describe("resolveDeviceExport", () => {
	it("returns the size, the rate and the format that were asked for", () => {
		const resolved = resolveDeviceExport({
			width: 3840,
			height: 2160,
			fps: 60,
			format: "mp4",
			userWatermark: "",
		});

		expect(resolved.config.width).toBe(3840);
		expect(resolved.config.height).toBe(2160);
		expect(resolved.config.fps).toBe(60);
		expect(resolved.config.format).toBe("mp4");
	});

	it("carries the user's own watermark, trimmed", () => {
		const resolved = resolveDeviceExport({ ...request(3840, 2160), userWatermark: "  @me  " });

		expect(resolved.watermark).toBe("@me");
	});

	it("stamps nothing when the user wrote nothing", () => {
		expect(resolveDeviceExport(request(3840, 2160)).watermark).toBeUndefined();
		expect(
			resolveDeviceExport({ ...request(1280, 720), userWatermark: "   " }).watermark,
		).toBeUndefined();
	});

	it("keeps the whole advertised preset matrix, in either orientation", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				const resolved = resolveDeviceExport(request(width, height));

				expect({ aspect, tier, w: resolved.config.width, h: resolved.config.height }).toEqual({
					aspect,
					tier,
					w: width,
					h: height,
				});
			}
		}
	});
});
