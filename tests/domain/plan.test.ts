import { BRANDING_WATERMARK, Plan } from "@/domain/value-objects/plan";
import { describe, expect, it } from "vitest";

describe("Plan", () => {
	describe("tiers", () => {
		it("local unlocks everything and is the unpaid OSS default", () => {
			const local = Plan.local();
			expect(local.tier).toBe("local");
			expect(local.label).toBe("Local");
			expect(local.isPaid).toBe(false);
			expect(local.isPro).toBe(false);
			expect(local.isFree).toBe(false);
			expect(local.capabilities.forcesBrandingWatermark).toBe(false);
			expect(local.capabilities.allowsCustomWatermark).toBe(true);
		});

		it("free is a single-seat, unpaid tier capped at 1080p that forces branding", () => {
			const free = Plan.free();
			expect(free.tier).toBe("free");
			expect(free.isFree).toBe(true);
			expect(free.isPaid).toBe(false);
			expect(free.seatLimit).toBe(1);
			expect(free.capabilities.maxLongEdge).toBe(1920);
			expect(free.capabilities.maxShortEdge).toBe(1080);
			expect(free.capabilities.forcesBrandingWatermark).toBe(true);
			expect(free.capabilities.allowsCloudExport).toBe(false);
		});

		it("pro is paid, single-seat, and unlocks 4K, cloud export and the priority queue", () => {
			const pro = Plan.pro();
			expect(pro.tier).toBe("pro");
			expect(pro.isPro).toBe(true);
			expect(pro.isPaid).toBe(true);
			expect(pro.seatLimit).toBe(1);
			expect(pro.capabilities.maxLongEdge).toBe(3840);
			expect(pro.capabilities.maxShortEdge).toBe(2160);
			expect(pro.capabilities.forcesBrandingWatermark).toBe(false);
			expect(pro.capabilities.allowsCloudExport).toBe(true);
			expect(pro.capabilities.priorityQueue).toBe(true);
		});

		it("team is paid, carries a seat count and has Pro-level export entitlements", () => {
			const team = Plan.team(5);
			expect(team.tier).toBe("team");
			expect(team.isPaid).toBe(true);
			expect(team.seatLimit).toBe(5);
			expect(team.capabilities.seats).toBe(5);
			expect(team.capabilities.maxLongEdge).toBe(3840);
			expect(team.capabilities.allowsCloudExport).toBe(true);
		});

		it("labels each tier", () => {
			expect(Plan.local().label).toBe("Local");
			expect(Plan.free().label).toBe("Free");
			expect(Plan.pro().label).toBe("Pro");
			expect(Plan.team(3).label).toBe("Team");
		});
	});

	describe("seats", () => {
		it("builds a team with a custom seat count", () => {
			expect(Plan.team(10).seatLimit).toBe(10);
		});

		it("rejects a seat limit below one", () => {
			expect(() => Plan.team(0)).toThrow();
		});

		it("rejects a non-integer seat limit", () => {
			expect(() => Plan.team(2.5)).toThrow();
		});

		it("changes the seat count immutably", () => {
			const plan = Plan.team(3);
			const bigger = plan.withSeats(10);
			expect(bigger.seatLimit).toBe(10);
			expect(plan.seatLimit).toBe(3);
			expect(bigger).not.toBe(plan);
		});
	});

	describe("fromTier", () => {
		it("parses the single-seat tiers and defaults the unknown to free", () => {
			expect(Plan.fromTier("pro").isPro).toBe(true);
			expect(Plan.fromTier("local").tier).toBe("local");
			expect(Plan.fromTier("free").isFree).toBe(true);
			expect(Plan.fromTier("garbage").isFree).toBe(true);
		});
	});

	describe("clampResolution", () => {
		it("scales 4K down to 1080p on free, preserving aspect ratio and even dims", () => {
			const { width, height } = Plan.free().clampResolution(3840, 2160);
			expect(width).toBe(1920);
			expect(height).toBe(1080);
			expect(width % 2).toBe(0);
			expect(height % 2).toBe(0);
		});

		it("leaves within-limit resolutions untouched", () => {
			expect(Plan.free().clampResolution(1280, 720)).toEqual({ width: 1280, height: 720 });
		});

		it("keeps 4K on pro and on local", () => {
			expect(Plan.pro().clampResolution(3840, 2160)).toEqual({ width: 3840, height: 2160 });
			expect(Plan.local().clampResolution(3840, 2160)).toEqual({ width: 3840, height: 2160 });
		});
	});

	describe("allowsResolution", () => {
		it("rejects 4K on free but allows it on pro and local", () => {
			expect(Plan.free().allowsResolution(3840, 2160)).toBe(false);
			expect(Plan.pro().allowsResolution(3840, 2160)).toBe(true);
			expect(Plan.local().allowsResolution(3840, 2160)).toBe(true);
		});
	});

	/**
	 * A plan grants a rectangle, not a pair of axis limits: rotating an allowed
	 * export must never change the answer. Vertical is the common shape here
	 * (Reels, Shorts, TikTok), so getting this backwards downgrades the formats
	 * the product is built for.
	 */
	describe("resolution caps are orientation-free", () => {
		const rotations: [number, number][] = [
			[3840, 2160], // 16:9 4K
			[2160, 3840], // 9:16 4K
			[2560, 1440], // 16:9 1440p
			[1440, 2560], // 9:16 1440p
			[2160, 2880], // 3:4 4K
		];

		for (const [width, height] of rotations) {
			it(`pro allows ${width}x${height} and leaves it untouched`, () => {
				expect(Plan.pro().allowsResolution(width, height)).toBe(true);
				expect(Plan.pro().clampResolution(width, height)).toEqual({ width, height });
			});
		}

		it("free keeps a portrait 1080p export at full size", () => {
			// 9:16 at 1080p is 1080x1920: the same entitlement as 1920x1080, rotated.
			expect(Plan.free().allowsResolution(1080, 1920)).toBe(true);
			expect(Plan.free().clampResolution(1080, 1920)).toEqual({ width: 1080, height: 1920 });
		});

		it("a plan answers identically for a size and its rotation", () => {
			for (const plan of [Plan.free(), Plan.pro(), Plan.team(3), Plan.local()]) {
				for (const [width, height] of rotations) {
					expect(plan.allowsResolution(width, height)).toBe(plan.allowsResolution(height, width));
					const upright = plan.clampResolution(width, height);
					const rotated = plan.clampResolution(height, width);
					expect({ w: upright.width, h: upright.height }).toEqual({
						w: rotated.height,
						h: rotated.width,
					});
				}
			}
		});

		it("still refuses a size that outruns the rectangle in either orientation", () => {
			// 5000 on the long edge beats Pro's 3840 whichever way round it is.
			expect(Plan.pro().allowsResolution(5000, 2000)).toBe(false);
			expect(Plan.pro().allowsResolution(2000, 5000)).toBe(false);
			// 2400 on the SHORT edge beats Pro's 2160 even though 3000 fits the long.
			expect(Plan.pro().allowsResolution(3000, 2400)).toBe(false);
		});
	});

	describe("effectiveWatermark", () => {
		it("free always renders the branding watermark, ignoring custom text", () => {
			expect(Plan.free().effectiveWatermark("")).toBe(BRANDING_WATERMARK);
			expect(Plan.free().effectiveWatermark("@me")).toBe(BRANDING_WATERMARK);
		});

		it("pro renders the user's custom watermark, or nothing when empty", () => {
			expect(Plan.pro().effectiveWatermark("@me")).toBe("@me");
			expect(Plan.pro().effectiveWatermark("   ")).toBeUndefined();
			expect(Plan.pro().effectiveWatermark("")).toBeUndefined();
		});

		it("local passes the user's watermark through and never forces branding", () => {
			expect(Plan.local().effectiveWatermark("@me")).toBe("@me");
			expect(Plan.local().effectiveWatermark("")).toBeUndefined();
		});
	});

	describe("duration", () => {
		it("free allows short clips only; pro and local allow long ones", () => {
			expect(Plan.free().allowsDuration(30_000)).toBe(true);
			expect(Plan.free().allowsDuration(120_000)).toBe(false);
			expect(Plan.pro().allowsDuration(120_000)).toBe(true);
			expect(Plan.local().allowsDuration(60 * 60_000)).toBe(true);
		});
	});

	describe("local gates nothing (the OSS default)", () => {
		it("passes any resolution, fps and duration through untouched", () => {
			const local = Plan.local();
			expect(local.clampResolution(7680, 4320)).toEqual({ width: 7680, height: 4320 });
			expect(local.clampFps(120)).toBe(120);
			expect(local.allowsFps(240)).toBe(true);
			expect(local.allowsDuration(Number.MAX_SAFE_INTEGER)).toBe(true);
		});
	});
});
