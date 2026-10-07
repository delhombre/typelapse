import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeviceFrame } from "@/presentation/landing/device-frame";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * The chassis sits at y~2200 on the landing and paints at 320x654 CSS px. It was
 * the 1350x2760 master, eager, with no dimensions: 60 KB fetched before the
 * hero's own bytes were done, for pixels nobody sees. It now ships at the size
 * it is shown (1x) and twice that (2x), lazy, with its ratio declared.
 */

const PUBLIC = resolve(__dirname, "../../public");

/** WebP's VP8X/VP8/VP8L chunk, read for the pixel size alone. */
function webpSize(file: string): { width: number; height: number } {
	const bytes = readFileSync(resolve(PUBLIC, file));
	const kind = bytes.toString("ascii", 12, 16);
	if (kind === "VP8X") {
		return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
	}
	if (kind === "VP8 ") {
		return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
	}
	const bits = bytes.readUInt32LE(21);
	return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
}

function chassis(): HTMLImageElement {
	const { container } = render(<DeviceFrame ariaLabel="phone">{null}</DeviceFrame>);
	const image = container.querySelector("img");
	if (!image) {
		throw new Error("the device frame should draw its chassis as an image");
	}
	return image;
}

describe("the iPhone chassis image", () => {
	it("offers the displayed size and its 2x", () => {
		const image = chassis();
		const candidates = (image.getAttribute("srcset") ?? "")
			.split(",")
			.map((entry) => entry.trim().split(/\s+/));

		expect(candidates.map(([, descriptor]) => descriptor)).toEqual(["320w", "640w"]);
		for (const [path, descriptor] of candidates) {
			const width = Number.parseInt(descriptor ?? "", 10);
			expect(webpSize((path ?? "").replace(/^\//, "")).width).toBe(width);
		}
		expect(image.getAttribute("src")).toBe(candidates[0]?.[0]);
	});

	it("declares the box it paints in, at the asset's ratio", () => {
		const image = chassis();
		const small = webpSize("illustrations/iphone-frame-320.webp");

		expect(image.getAttribute("width")).toBe(String(small.width));
		expect(image.getAttribute("height")).toBe(String(small.height));
		expect(image.getAttribute("sizes")).toBe("min(320px, 100vw)");
	});

	it("loads lazily and decodes off the main thread", () => {
		const image = chassis();

		expect(image.getAttribute("loading")).toBe("lazy");
		expect(image.getAttribute("decoding")).toBe("async");
	});

	it("keeps both files at one ratio, the ratio the screen well is measured on", () => {
		const small = webpSize("illustrations/iphone-frame-320.webp");
		const large = webpSize("illustrations/iphone-frame-640.webp");

		expect(large.width).toBe(small.width * 2);
		expect(large.height).toBe(small.height * 2);
		expect(small.width / small.height).toBeCloseTo(1350 / 2760, 2);
	});
});
