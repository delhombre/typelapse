import { fitMediaToBox, projectFittedMediaRect } from "@/application/layout/media-fit";
import { describe, expect, it } from "vitest";

describe("fitMediaToBox", () => {
	it("contains a landscape asset without cropping", () => {
		expect(
			fitMediaToBox({
				source: { width: 1600, height: 900 },
				box: { x: 100, y: 50, width: 400, height: 400 },
				fit: "contain",
				focalPoint: { x: 0.5, y: 0.5 },
			}),
		).toEqual({
			source: { x: 0, y: 0, width: 1600, height: 900 },
			destination: { x: 100, y: 137.5, width: 400, height: 225 },
		});
	});

	it("covers a square by cropping around the focal point", () => {
		expect(
			fitMediaToBox({
				source: { width: 1600, height: 900 },
				box: { x: 0, y: 0, width: 400, height: 400 },
				fit: "cover",
				focalPoint: { x: 0.75, y: 0.5 },
			}),
		).toEqual({
			source: { x: 700, y: 0, width: 900, height: 900 },
			destination: { x: 0, y: 0, width: 400, height: 400 },
		});
	});

	it("clamps a focal crop at the source edge", () => {
		const fitted = fitMediaToBox({
			source: { width: 900, height: 1600 },
			box: { x: 20, y: 30, width: 400, height: 200 },
			fit: "cover",
			focalPoint: { x: 0.5, y: 1 },
		});

		expect(fitted).toEqual({
			source: { x: 0, y: 1150, width: 900, height: 450 },
			destination: { x: 20, y: 30, width: 400, height: 200 },
		});
	});

	it("rejects invalid intrinsic and destination dimensions", () => {
		expect(() =>
			fitMediaToBox({
				source: { width: 0, height: 100 },
				box: { x: 0, y: 0, width: 100, height: 100 },
				fit: "cover",
				focalPoint: { x: 0.5, y: 0.5 },
			}),
		).toThrow("positive");
	});

	it("projects the same local media element rectangle for DOM and Remotion", () => {
		const fit = fitMediaToBox({
			source: { width: 1600, height: 900 },
			box: { x: 480, y: 0, width: 960, height: 1080 },
			fit: "cover",
			focalPoint: { x: 0.75, y: 0.5 },
		});

		expect(
			projectFittedMediaRect({
				intrinsic: { width: 1600, height: 900 },
				fit,
				container: { x: 480, y: 0 },
			}),
		).toEqual({ x: -960, y: 0, width: 1920, height: 1080 });
	});
});
