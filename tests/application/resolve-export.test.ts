import { resolveExport } from "@/application/export/resolve-export";
import { ASPECT_LABELS, RESOLUTION_TIERS, dimensionsFor } from "@/domain/entities/render-config";
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

/**
 * A resolution tier names the SHORT edge (see `dimensionsFor`): "1440p" vertical
 * is 1440 wide by 2560 tall. The export bar advertises every aspect × tier
 * combination with its exact pixel size and no plan gate, so whatever a paid plan
 * claims to deliver, the hosted path has to deliver — in either orientation.
 */
describe("resolveExport across the advertised preset matrix", () => {
	const request = (width: number, height: number) => ({
		width,
		height,
		fps: 60,
		format: "mp4" as const,
		userWatermark: "",
	});

	for (const plan of [Plan.pro(), Plan.team(5)]) {
		describe(`${plan.label}: every preset renders at the size the UI promises`, () => {
			for (const aspect of ASPECT_LABELS) {
				for (const tier of RESOLUTION_TIERS) {
					it(`${aspect} ${tier}`, () => {
						const { width, height } = dimensionsFor(aspect, tier);
						const resolved = resolveExport(plan, request(width, height));

						expect({ w: resolved.config.width, h: resolved.config.height }).toEqual({
							w: width,
							h: height,
						});
						expect(resolved.downgraded).toBe(false);
					});
				}
			}
		});
	}

	describe("free: the whole 1080p row survives, in any orientation", () => {
		for (const aspect of ASPECT_LABELS) {
			it(`${aspect} 1080p`, () => {
				const { width, height } = dimensionsFor(aspect, "1080p");
				const resolved = resolveExport(Plan.free(), request(width, height));

				expect({ w: resolved.config.width, h: resolved.config.height }).toEqual({
					w: width,
					h: height,
				});
				expect(resolved.downgraded).toBe(false);
			});
		}
	});

	it("free: still refuses a tier above its own, vertical included", () => {
		// 9:16 at 1440p is 1440x2560: its long edge outruns Free's 1920.
		const { width, height } = dimensionsFor("9:16", "1440p");
		const resolved = resolveExport(Plan.free(), request(width, height));

		expect(resolved.downgraded).toBe(true);
		expect(Math.max(resolved.config.width, resolved.config.height)).toBeLessThanOrEqual(1920);
	});
});
