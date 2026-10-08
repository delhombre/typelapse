import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ExportShapes } from "@/presentation/landing/export-section";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing export stage: the shapes", () => {
	it("shows four of the export's shapes as pictures that hold their box before they load", () => {
		render(<ExportShapes />);
		const images = screen.getAllByRole("img");

		expect(images.map((image) => image.getAttribute("alt"))).toEqual([
			"The same scene in 16:9.",
			"The same scene in 1:1.",
			"The same scene in 4:5.",
			"The same scene in 9:16.",
		]);
		for (const image of images) {
			const width = Number(image.getAttribute("width"));
			const height = Number(image.getAttribute("height"));
			expect(width).toBeGreaterThan(0);
			expect(height).toBe(320);
			expect(image.getAttribute("loading")).toBe("lazy");
			const file = resolve(__dirname, "../../public", `.${image.getAttribute("src")}`);
			expect(existsSync(file), file).toBe(true);
		}
	});

	it("names the list it is, and writes its copy without em-dashes", () => {
		const { container } = render(<ExportShapes />);

		expect(screen.getByRole("list", { name: "Export shapes" })).toBeTruthy();
		expect(container.textContent).not.toContain("—");
	});
});
