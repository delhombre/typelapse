import { resolveExport } from "@/application/export/resolve-export";
import { BRANDING_WATERMARK, Plan } from "@/domain/value-objects/plan";
import { describe, expect, it } from "vitest";

describe("resolveExport", () => {
	it("free: clamps 4K to 1080p, forces branding, targets local render", () => {
		const resolved = resolveExport(Plan.free(), {
			width: 3840,
			height: 2160,
			fps: 60,
			format: "mp4",
			userWatermark: "@me",
		});

		expect(resolved.config.width).toBe(1920);
		expect(resolved.config.height).toBe(1080);
		expect(resolved.watermark).toBe(BRANDING_WATERMARK);
		expect(resolved.target).toBe("local");
		expect(resolved.downgraded).toBe(true);
	});

	it("free: a 1080p request is not downgraded but still branded", () => {
		const resolved = resolveExport(Plan.free(), {
			width: 1920,
			height: 1080,
			fps: 60,
			format: "mp4",
			userWatermark: "",
		});
		expect(resolved.downgraded).toBe(false);
		expect(resolved.watermark).toBe(BRANDING_WATERMARK);
		expect(resolved.target).toBe("local");
	});

	it("pro: keeps 4K/60, uses the custom watermark, targets cloud", () => {
		const resolved = resolveExport(Plan.pro(), {
			width: 3840,
			height: 2160,
			fps: 60,
			format: "mp4",
			userWatermark: "@me",
		});

		expect(resolved.config.width).toBe(3840);
		expect(resolved.config.height).toBe(2160);
		expect(resolved.watermark).toBe("@me");
		expect(resolved.target).toBe("cloud");
		expect(resolved.downgraded).toBe(false);
	});

	it("pro: no custom watermark yields a clean export", () => {
		const resolved = resolveExport(Plan.pro(), {
			width: 1920,
			height: 1080,
			fps: 60,
			format: "webm",
			userWatermark: "",
		});
		expect(resolved.watermark).toBeUndefined();
		expect(resolved.config.format).toBe("webm");
	});

	describe("local (the OSS default) gates nothing", () => {
		it("passes 4K/60 and the user's watermark through, targeting local render", () => {
			const resolved = resolveExport(Plan.local(), {
				width: 3840,
				height: 2160,
				fps: 60,
				format: "mp4",
				userWatermark: "@me",
			});

			expect(resolved.config.width).toBe(3840);
			expect(resolved.config.height).toBe(2160);
			expect(resolved.config.fps).toBe(60);
			expect(resolved.watermark).toBe("@me");
			expect(resolved.target).toBe("local");
			expect(resolved.downgraded).toBe(false);
		});

		it("never forces a branding watermark: an empty watermark stays empty", () => {
			const resolved = resolveExport(Plan.local(), {
				width: 1280,
				height: 720,
				fps: 30,
				format: "gif",
				userWatermark: "",
			});
			expect(resolved.watermark).toBeUndefined();
			expect(resolved.downgraded).toBe(false);
			expect(resolved.target).toBe("local");
		});
	});
});
