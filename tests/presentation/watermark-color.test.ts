import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { describe, expect, it } from "vitest";

const FG = "#e6edf3";

describe("getWatermarkColor", () => {
	it("tints the theme foreground on a transparent background", () => {
		expect(getWatermarkColor("transparent", FG)).toBe(`${FG}66`);
	});

	it("uses white over a mesh background", () => {
		expect(getWatermarkColor("mesh:aurora", FG)).toBe("rgba(255,255,255,0.4)");
	});

	it("uses white over an image background", () => {
		expect(getWatermarkColor("image:data:image/png;base64,AAAA", FG)).toBe(
			"rgba(255,255,255,0.45)",
		);
	});

	it("picks black on a light solid and white on a dark solid", () => {
		expect(getWatermarkColor("#f0f4f8", FG)).toBe("rgba(0,0,0,0.4)");
		expect(getWatermarkColor("#0d1117", FG)).toBe("rgba(255,255,255,0.4)");
	});
});
