import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ExportShapes } from "@/presentation/landing/export-section";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing export stage: the shapes", () => {
	it("shows all five of the export's shapes as pictures that hold their box before they load", () => {
		render(<ExportShapes />);
		const images = screen.getAllByRole("img");

		expect(images.map((image) => image.getAttribute("alt"))).toEqual([
			"The same scene in 16:9.",
			"The same scene in 1:1.",
			"The same scene in 4:5.",
			"The same scene in 3:4.",
			"The same scene in 9:16.",
		]);
		const RATIOS = [16 / 9, 1, 4 / 5, 3 / 4, 9 / 16];
		images.forEach((image, index) => {
			const width = Number(image.getAttribute("width"));
			const height = Number(image.getAttribute("height"));
			// Declared at the shape's own ratio, so the box it holds is the right one.
			expect(width / height).toBeCloseTo(RATIOS[index] ?? 0, 1);
			expect(image.getAttribute("loading")).toBe("lazy");
			const file = resolve(__dirname, "../../public", `.${image.getAttribute("src")}`);
			expect(existsSync(file), file).toBe(true);
		});
	});

	it("names the list it is, and writes its copy without em-dashes", () => {
		const { container } = render(<ExportShapes />);

		expect(screen.getByRole("list", { name: "Export shapes" })).toBeTruthy();
		expect(container.textContent).not.toContain("—");
	});
});
