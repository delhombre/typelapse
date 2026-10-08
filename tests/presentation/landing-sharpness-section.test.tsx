import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextSplit, splitAt } from "@/presentation/landing/compare-split";
import { SharpnessSection } from "@/presentation/landing/sharpness-section";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import manifest from "../../docs/sharpness/sharpness.json";

const webm = manifest.files.find((file) => file.format === "webm");
const mp4 = manifest.files.find((file) => file.format === "mp4");

describe("the split between the two files", () => {
	it("follows the pointer across the picture, held inside it", () => {
		expect(splitAt(150, 100, 200)).toBe(25);
		expect(splitAt(50, 100, 200)).toBe(0);
		expect(splitAt(400, 100, 200)).toBe(100);
		expect(splitAt(150, 100, 0)).toBe(50);
	});

	it("steps by 5 on the arrows, by 25 on the page keys, to the ends on Home and End", () => {
		expect(nextSplit(50, "ArrowRight")).toBe(55);
		expect(nextSplit(50, "ArrowLeft")).toBe(45);
		expect(nextSplit(50, "ArrowUp")).toBe(55);
		expect(nextSplit(98, "ArrowRight")).toBe(100);
		expect(nextSplit(50, "PageDown")).toBe(25);
		expect(nextSplit(50, "Home")).toBe(0);
		expect(nextSplit(50, "End")).toBe(100);
		expect(nextSplit(50, "a")).toBeNull();
	});
});

describe("landing sharpness section", () => {
	it("states the benefit as its heading, and why in one sentence", () => {
		const { container } = render(<SharpnessSection />);

		expect(
			screen.getByRole("heading", { level: 2, name: "Thin coloured code stays crisp." }),
		).toBeTruthy();
		expect(container.textContent).toMatch(/one colour for every four pixels/);
		expect(container.textContent).toMatch(/keeps every pixel’s colour/);
	});

	it("is one comparison: a slider over the same line, WebM on one side, MP4 on the other", () => {
		const { container } = render(<SharpnessSection />);
		const slider = screen.getByRole("slider", { name: /webm.*mp4/i });

		expect(slider.getAttribute("aria-valuenow")).toBe("50");
		expect(slider.getAttribute("aria-valuemin")).toBe("0");
		expect(slider.getAttribute("aria-valuemax")).toBe("100");
		expect(slider.tabIndex).toBe(0);
		fireEvent.keyDown(slider, { key: "ArrowRight" });
		expect(slider.getAttribute("aria-valuenow")).toBe("55");
		fireEvent.keyDown(slider, { key: "End" });
		expect(slider.getAttribute("aria-valuenow")).toBe("100");

		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
		for (const image of images) {
			expect(image.getAttribute("width")).toBe(String(manifest.crop.width));
			expect(image.getAttribute("height")).toBe(String(manifest.crop.height));
			expect(image.className).toContain("[image-rendering:pixelated]");
		}
		const sides = container.querySelector(".lp-proof-sides")?.textContent;
		expect(sides).toBe("WebMMP4");
	});

	it("can show where each file departs from the original instead of its pixels", () => {
		render(<SharpnessSection />);
		const pixels = screen.getByRole("button", { name: "Pixels" });
		const error = screen.getByRole("button", { name: "Difference" });
		const sources = () => screen.getAllByRole("img").map((image) => image.getAttribute("src"));

		expect(pixels.getAttribute("aria-pressed")).toBe("true");
		const before = sources();
		fireEvent.click(error);
		expect(error.getAttribute("aria-pressed")).toBe("true");
		expect(sources()).not.toEqual(before);
		expect(screen.getAllByRole("img")[0]?.getAttribute("alt")).toMatch(
			/departs from the original/i,
		);
	});

	/* The numbers are the manifest's, so the page cannot print a figure the files
	   on disk do not have; they sit in a quiet footnote that says which way is good. */
	it("prints what the script measured in a footnote, with which way is better", () => {
		const { container } = render(<SharpnessSection />);
		const note = container.querySelector("figcaption");

		for (const file of [webm, mp4]) {
			expect(note?.textContent).toContain(`${file?.psnr.toFixed(2)} dB`);
			expect(note?.textContent).toContain(`${((file?.bytes ?? 0) / 1e6).toFixed(2)} MB`);
		}
		expect(note?.textContent).toMatch(/higher is closer to the original/i);
		expect(within(note as HTMLElement).getByText("pnpm sharpness:render")).toBeTruthy();
		expect(note?.textContent).toContain(`Chromium ${manifest.browser.split(" ")[1]}`);
		expect(note?.textContent).toMatch(/falls back to 4:2:0/);
		expect(note?.textContent).not.toMatch(/painter/i);
	});

	it("writes its copy without dashes, exclamation marks or superlatives", () => {
		const { container } = render(<SharpnessSection />);
		const text = container.textContent ?? "";

		expect(text).not.toMatch(/[–—!]/);
		expect(text).not.toMatch(/\b(best|sharpest|stunning|seamless\w*)\b/i);
	});

	it("sits in the landing, right after the pipeline's last stage, on the dark band", () => {
		const page = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/landing-page.tsx"),
			"utf8",
		).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
		expect(page).toMatch(/<PipelineSection \/>\s*<SharpnessSection \/>/);

		const { container } = render(<SharpnessSection />);
		const section = container.querySelector("section");
		expect(section?.id).toBe("proof");
		expect(section?.className).toContain("lp-dark");
	});
});
