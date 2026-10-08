import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SharpnessSection } from "@/presentation/landing/sharpness-section";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import manifest from "../../docs/sharpness/sharpness.json";

describe("landing sharpness section", () => {
	it("states the claim as a heading", () => {
		render(<SharpnessSection />);

		expect(
			screen.getByRole("heading", { level: 2, name: /the webm is as sharp as the preview/i }),
		).toBeTruthy();
	});

	/* The numbers are the manifest's, so the page cannot print a figure the files
	   on disk do not have. */
	it("prints what the script measured, file by file", () => {
		render(<SharpnessSection />);

		for (const file of manifest.files) {
			const name = file.format === "webm" ? "WebM · AV1 4:4:4" : "MP4 · H.264 4:2:0";
			const row = screen.getByText(name).parentElement;
			expect(row?.textContent).toContain(
				`${file.psnr.toFixed(2)}\u00a0dB · ${(file.bytes / 1e6).toFixed(2)}\u00a0MB`,
			);
		}
		expect(manifest.files.map((file) => file.format).sort()).toEqual(["mp4", "webm"]);
	});

	it("says how it was measured and how to reproduce it", () => {
		const { container } = render(<SharpnessSection />);
		const caption = container.querySelector("figcaption");

		expect(caption?.textContent).toMatch(/PSNR in RGB against the lossless reference frame/);
		// "The painter" is our internal name for the renderer, not a word a reader has.
		expect(caption?.textContent).not.toMatch(/painter/i);
		expect(caption?.textContent).toMatch(/1\.6 s clip/);
		expect(within(caption as HTMLElement).getByText("pnpm sharpness:render")).toBeTruthy();
		// AV1 High is the browser's, not ours: the page says where the files came from.
		expect(caption?.textContent).toContain(
			`Exported in ${manifest.browser} on ${manifest.platform}`,
		);
		expect(caption?.textContent).toMatch(/falls back to 4:2:0/);
	});

	/* Both sides declared, so the page does not move when the crops load; and an
	   enlargement that a browser smooths would invent the softness being shown. */
	it("reserves the crops' space and enlarges them without smoothing", () => {
		render(<SharpnessSection />);
		const images = screen.getAllByRole("img");

		expect(images).toHaveLength(2);
		for (const image of images) {
			expect(image.getAttribute("width")).toBe(String(manifest.crop.width));
			expect(image.getAttribute("height")).toBe(String(manifest.crop.height));
			expect(image.getAttribute("alt")).toBeTruthy();
			expect(image.className).toContain("[image-rendering:pixelated]");
			expect(image.getAttribute("loading")).toBe("lazy");
			expect(image.parentElement?.className).toMatch(/h-\[96px\].*lg:h-\[144px\]/);
		}
	});

	it("writes its copy without em-dashes, exclamation marks or superlatives", () => {
		const { container } = render(<SharpnessSection />);
		const text = container.textContent ?? "";

		expect(text).not.toContain("—");
		expect(text).not.toContain("!");
		expect(text).not.toMatch(/\b(best|sharpest|stunning|crisp|seamless\w*)\b/i);
	});

	/* Read from the source rather than rendered: the whole page needs a canvas,
	   matchMedia and the Instrument's engine, none of which this order depends on. */
	it("sits in the landing, right after the export section", () => {
		const page = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/landing-page.tsx"),
			"utf8",
		);

		const elements = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

		expect(elements).toMatch(/<ExportSection \/>\s*<SharpnessSection \/>/);
	});
});
