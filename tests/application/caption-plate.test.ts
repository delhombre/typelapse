import { contrastRatio } from "@/application/accessibility/token-contrast";
import { MESH_PRESETS, parseMeshBackground } from "@/application/backgrounds/mesh-gradient";
import {
	CAPTION_INK,
	CAPTION_PLATE_ALPHA,
	CAPTION_PLATE_COLOR,
	captionContrastOver,
	plateOver,
} from "@/application/captions/caption-plate";
import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { describe, expect, it } from "vitest";

/**
 * #226: "Say hello to everyone" was pale over the orange mesh. The caption wore
 * the watermark's colour (white at 40%); it now sits on a plate, and the plate is
 * measured against the lightest colour of every mesh, because the preview's
 * background is a flowing gradient and the caption can land on any part of it.
 */

function luminance(hex: string): number {
	const value = Number.parseInt(hex.slice(1), 16);
	const lin = (channel: number) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * lin((value >> 16) & 255) + 0.7152 * lin((value >> 8) & 255) + 0.0722 * lin(value & 255)
	);
}

/** The lightest colour a mesh reaches: its lightest blob at its centre, or its base. */
function lightestRegion(id: string): string {
	const preset = parseMeshBackground(`mesh:${id}`);
	if (!preset) {
		throw new Error(`no mesh ${id}`);
	}
	return [preset.base, ...preset.blobs.map((blob) => blob.color)].reduce((lightest, color) =>
		luminance(color) > luminance(lightest) ? color : lightest,
	);
}

describe("the caption's plate", () => {
	it("holds 4.5:1 over the lightest region of the default mesh, which is the brand's yellow", () => {
		expect(lightestRegion("solar")).toBe("#f1be01");
		expect(captionContrastOver(lightestRegion("solar"))).toBeGreaterThanOrEqual(4.5);
	});

	it.each(MESH_PRESETS.map((preset) => preset.id))(
		"holds 4.5:1 over the lightest region of the %s mesh",
		(id) => {
			expect(captionContrastOver(lightestRegion(id))).toBeGreaterThanOrEqual(4.5);
		},
	);

	it("holds it over white and over black, the two ends a solid background can be", () => {
		expect(captionContrastOver("#ffffff")).toBeGreaterThanOrEqual(4.5);
		expect(captionContrastOver("#000000")).toBeGreaterThanOrEqual(4.5);
	});

	it("is what the old colour was not: the watermark's white at 40% read 1.2:1 over the default mesh", () => {
		expect(getWatermarkColor("mesh:solar", "#abb2bf")).toBe("rgba(255,255,255,0.4)");
		// That white laid over the yellow, composited (R 246.6, G 216, B 102.6).
		const pale = "#f7d867";
		expect(contrastRatio(pale, lightestRegion("solar"))).toBeLessThan(1.3);
	});

	it("is the island's own plate, so the caption's material is one the product already has", () => {
		expect(CAPTION_PLATE_COLOR).toBe("#151517");
		expect(CAPTION_PLATE_ALPHA).toBeGreaterThan(0.5);
		expect(CAPTION_PLATE_ALPHA).toBeLessThan(0.8);
	});

	it("lets the background show through: it is a plate, not a slab", () => {
		expect(plateOver("#f1be01")).not.toBe(plateOver("#0a0a18"));
		expect(CAPTION_PLATE_ALPHA).toBeLessThan(1);
	});

	it("reads its ink off the studio's paper, opaque", () => {
		expect(CAPTION_INK).toBe("#faf9f6");
	});
});
