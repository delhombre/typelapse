import {
	type Backdrop,
	coverRect,
	linearGradientLine,
	parseBackdrop,
	radialGradientRadii,
} from "@/application/backgrounds/backdrop";
import { BACKGROUND_PRESETS } from "@/presentation/components/preview/background-picker";
import { describe, expect, it } from "vitest";

/** The picker's own preset values, read from it, so a drift in either shows up here. */
const PRESET_VALUES = BACKGROUND_PRESETS.map((preset) => preset.value).filter(
	(value) => value !== "transparent",
);

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

describe("parseBackdrop", () => {
	it("reads every value the background picker can produce", () => {
		// The picker offers exactly these kinds; none of them may fall through to
		// the `solid` catch-all, because a canvas silently ignores a fillStyle it
		// cannot parse and the export comes out black.
		expect(parseBackdrop("transparent").kind).toBe("transparent");
		expect(parseBackdrop("mesh:aurora").kind).toBe("mesh");
		expect(parseBackdrop("#1e293b").kind).toBe("solid");
		expect(parseBackdrop(`image:${PIXEL}`).kind).toBe("image");
		for (const value of PRESET_VALUES) {
			expect(parseBackdrop(value).kind, value).toMatch(/^(linear|radial)$/);
		}
	});

	it("keeps the mesh preset it names", () => {
		const backdrop = parseBackdrop("mesh:ocean");
		expect(backdrop.kind === "mesh" && backdrop.preset.id).toBe("ocean");
	});

	it("unwraps an image background to its data URL", () => {
		const backdrop = parseBackdrop(`image:${PIXEL}`);
		expect(backdrop.kind === "image" && backdrop.source).toBe(PIXEL);
	});

	it("refuses a non-data image payload the way the CSS resolver does", () => {
		// Same SSRF boundary as `parseImageBackground`: anything that is not an
		// inline data image is not an image at all.
		expect(parseBackdrop("image:https://evil.example/x.png").kind).not.toBe("image");
	});

	it("reads a linear gradient's angle and stops", () => {
		const backdrop = parseBackdrop("linear-gradient(135deg, #667eea 0%, #764ba2 100%)");
		expect(backdrop).toEqual<Backdrop>({
			kind: "linear",
			angleDeg: 135,
			stops: [
				{ offset: 0, color: "#667eea" },
				{ offset: 1, color: "#764ba2" },
			],
		});
	});

	it("defaults a linear gradient with no angle to `to bottom`", () => {
		const backdrop = parseBackdrop("linear-gradient(#000000, #ffffff)");
		expect(backdrop.kind === "linear" && backdrop.angleDeg).toBe(180);
	});

	it("reads the `to <side>` spelling of an angle", () => {
		const cases: [string, number][] = [
			["to top", 0],
			["to right", 90],
			["to bottom", 180],
			["to left", 270],
		];
		for (const [side, angle] of cases) {
			const backdrop = parseBackdrop(`linear-gradient(${side}, #000000, #ffffff)`);
			expect(backdrop.kind === "linear" && backdrop.angleDeg, side).toBe(angle);
		}
	});

	it("reads a radial gradient's shape, position and stops", () => {
		const backdrop = parseBackdrop(
			"radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, #0d1117 50%, #0a0e14 100%)",
		);
		expect(backdrop).toEqual<Backdrop>({
			kind: "radial",
			shape: "ellipse",
			x: 30,
			y: 20,
			stops: [
				{ offset: 0, color: "#1e3a5f" },
				{ offset: 0.5, color: "#0d1117" },
				{ offset: 1, color: "#0a0e14" },
			],
		});
	});

	it("defaults a radial gradient to a centred ellipse", () => {
		const backdrop = parseBackdrop("radial-gradient(#000000, #ffffff)");
		expect(backdrop).toMatchObject({ kind: "radial", shape: "ellipse", x: 50, y: 50 });
	});

	it("reads the circle shape the mesh layers are written in", () => {
		const backdrop = parseBackdrop(
			"radial-gradient(circle at 25.00% 25.00%, #6d28d9 0%, transparent 55%)",
		);
		expect(backdrop).toMatchObject({ kind: "radial", shape: "circle", x: 25, y: 25 });
	});

	it("spaces stops evenly when they carry no position", () => {
		const backdrop = parseBackdrop("linear-gradient(90deg, #000000, #888888, #ffffff)");
		expect(backdrop.kind === "linear" && backdrop.stops.map((stop) => stop.offset)).toEqual([
			0, 0.5, 1,
		]);
	});

	it("fades a `transparent` stop to its neighbour's colour, not to black", () => {
		// CSS interpolates in premultiplied space, so `#6d28d9 → transparent`
		// never passes through grey. A canvas does not, so the keyword has to be
		// spelled as the neighbour at zero alpha or the mesh grows a halo.
		const backdrop = parseBackdrop(
			"radial-gradient(circle at 50% 50%, #6d28d9 0%, transparent 55%)",
		);
		expect(backdrop.kind === "radial" && backdrop.stops[1]?.color).toBe("rgba(109, 40, 217, 0)");
	});

	it("keeps a colour with commas in it whole", () => {
		const backdrop = parseBackdrop("linear-gradient(90deg, rgba(1, 2, 3, 0.5) 0%, #ffffff 100%)");
		expect(backdrop.kind === "linear" && backdrop.stops[0]?.color).toBe("rgba(1, 2, 3, 0.5)");
	});

	it("falls back to a solid for anything it cannot read", () => {
		// The catch-all is what the painter did for everything before it could
		// read a gradient; it stays, so an unknown value is no worse than it was.
		expect(parseBackdrop("papayawhip")).toEqual<Backdrop>({ kind: "solid", color: "papayawhip" });
		expect(parseBackdrop("conic-gradient(#000, #fff)").kind).toBe("solid");
	});
});

describe("linearGradientLine", () => {
	it("runs top-to-bottom for 180deg, the CSS default", () => {
		const line = linearGradientLine(180, 100, 200);
		expect(line.x0).toBeCloseTo(50, 6);
		expect(line.x1).toBeCloseTo(50, 6);
		expect(line.y0).toBeCloseTo(0, 6);
		expect(line.y1).toBeCloseTo(200, 6);
	});

	it("runs left-to-right for 90deg", () => {
		const line = linearGradientLine(90, 100, 200);
		expect(line.x0).toBeCloseTo(0, 6);
		expect(line.x1).toBeCloseTo(100, 6);
		expect(line.y0).toBeCloseTo(100, 6);
		expect(line.y1).toBeCloseTo(100, 6);
	});

	it("runs bottom-to-top for 0deg", () => {
		const line = linearGradientLine(0, 100, 200);
		expect(line.y0).toBeCloseTo(200, 6);
		expect(line.y1).toBeCloseTo(0, 6);
	});

	it("puts both corners of a square on the line at 135deg", () => {
		// CSS sizes the gradient line so the corners perpendicular to it land
		// exactly on its ends: on a square at 135deg that is the diagonal.
		const line = linearGradientLine(135, 100, 100);
		expect(line.x0).toBeCloseTo(0, 6);
		expect(line.y0).toBeCloseTo(0, 6);
		expect(line.x1).toBeCloseTo(100, 6);
		expect(line.y1).toBeCloseTo(100, 6);
	});

	it("stays centred on the box whatever the angle", () => {
		for (const angle of [0, 37, 90, 135, 220, 315]) {
			const line = linearGradientLine(angle, 320, 180);
			expect((line.x0 + line.x1) / 2).toBeCloseTo(160, 6);
			expect((line.y0 + line.y1) / 2).toBeCloseTo(90, 6);
		}
	});
});

describe("radialGradientRadii", () => {
	it("reaches the farthest corner for a circle", () => {
		// The same number the mesh blobs have always used.
		expect(radialGradientRadii("circle", 0, 0, 300, 400)).toEqual({ rx: 500, ry: 500 });
	});

	it("passes through the farthest corner for an ellipse", () => {
		const { rx, ry } = radialGradientRadii("ellipse", 0, 0, 300, 400);
		expect(rx).toBeCloseTo(300 * Math.SQRT2, 6);
		expect(ry).toBeCloseTo(400 * Math.SQRT2, 6);
		// The defining property: (x/rx)² + (y/ry)² = 1 at the farthest corner.
		expect((300 / rx) ** 2 + (400 / ry) ** 2).toBeCloseTo(1, 6);
	});

	it("measures from the farthest side, not from the centre", () => {
		const { rx } = radialGradientRadii("ellipse", 90, 50, 100, 100);
		expect(rx).toBeCloseTo(90 * Math.SQRT2, 6);
	});
});

describe("coverRect", () => {
	it("fills the box and centres the overflow, like `center / cover`", () => {
		// A wide image into a square: height matches, width overhangs evenly.
		expect(coverRect(400, 200, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 });
	});

	it("crops the other way for a tall image", () => {
		expect(coverRect(200, 400, 100, 100)).toEqual({ x: 0, y: -50, width: 100, height: 200 });
	});

	it("leaves a matching aspect exactly filling the box", () => {
		expect(coverRect(1920, 1080, 960, 540)).toEqual({ x: 0, y: 0, width: 960, height: 540 });
	});

	it("never divides by a zero-sized image", () => {
		expect(coverRect(0, 0, 100, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
	});
});
