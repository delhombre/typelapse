import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PipelineSection, StepStrip } from "@/presentation/landing/pipeline";
import { PricingSection } from "@/presentation/landing/pricing-section";
import { SpecSheet } from "@/presentation/landing/spec-sheet";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/* The stages' pictures are tested on their own; here they only have to be there. */
vi.mock("@/presentation/landing/magic-move-section", () => ({ LiveMorph: () => <div /> }));
vi.mock("@/presentation/landing/social-section", () => ({ FeedCheck: () => <div /> }));

const STAGES = ["Paste", "Morph", "Check", "Export", "Hosted"];

describe("landing pipeline", () => {
	it("outlines the five steps in order, each a link to its stage", () => {
		render(<StepStrip />);
		const strip = screen.getByRole("navigation", { name: "The five steps" });
		const links = within(strip).getAllByRole("link");

		expect(links.map((link) => link.querySelector("b")?.textContent?.slice(3))).toEqual(STAGES);
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"#paste",
			"#morph",
			"#check",
			"#export",
			"#hosted",
		]);
	});

	it("lays the five stages on the rail, each a figure beside the product", () => {
		const { container } = render(<PipelineSection />);
		const stages = [...container.querySelectorAll("article")];

		expect(stages.map((stage) => stage.id)).toEqual([
			"paste",
			"morph",
			"check",
			"export",
			"hosted",
		]);
		for (const stage of stages) {
			expect(within(stage).getByRole("heading", { level: 2 })).toBeTruthy();
			// The figure is an image with its own label from the first paint.
			expect(stage.querySelector(".lp-fig-stage[role='img'][aria-label]")).not.toBeNull();
		}
		// The figures alternate sides down the rail on a wide screen.
		expect(
			stages.map((stage) => stage.querySelector(".lp-pair")?.hasAttribute("data-flip")),
		).toEqual([false, true, false, true, false]);
	});

	it("shows real captures, sized before they load, and the studio in the page's theme", () => {
		render(<PipelineSection />);
		const still = screen.getByRole("img", { name: /with its caption under the card/i });
		expect(still.getAttribute("width")).toBe("1200");
		expect(still.getAttribute("height")).toBe("675");
		expect(still.getAttribute("loading")).toBe("lazy");

		// Stage 01 is a capture of the studio after a paste, one per theme, never a lookalike.
		const studio = screen.getAllByRole("img", { name: /typelapse studio right after a diff/i });
		expect(studio.map((img) => img.getAttribute("src"))).toEqual([
			"/landing/studio-import-light.webp",
			"/landing/studio-import-dark.webp",
		]);
		expect(studio.map((img) => img.className)).toEqual(["lp-shot-light", "lp-shot-dark"]);
		for (const img of studio) {
			expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["1600", "878"]);
			expect(img.getAttribute("loading")).toBe("lazy");
		}
	});

	it("never imports a figure or the kernel up front", () => {
		const source = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/pipeline.tsx"),
			"utf8",
		);

		expect(source).not.toMatch(/^import .*figures\/(scenes|glide|safezone|local|queue|kernel)/m);
		expect(source.match(/import\("\.\/figures\/\w+"\)/g)).toHaveLength(5);
	});

	it("writes its copy without em-dashes, and with curly apostrophes", () => {
		const { container } = render(<PipelineSection />);

		expect(container.textContent).not.toContain("—");
		expect(container.textContent).not.toMatch(/["']/);
		for (const el of container.querySelectorAll("[aria-label], [alt]")) {
			expect(el.getAttribute("aria-label") ?? el.getAttribute("alt")).not.toMatch(/["']/);
		}
	});
});

describe("landing specification", () => {
	it("states the product on one sheet, the licence row as the repository's", () => {
		render(<SpecSheet />);
		const terms = screen.getAllByRole("term").map((term) => term.textContent);

		expect(terms).toEqual(["Import", "Look", "Motion", "Check", "On device", "Hosted", "Licence"]);
		// The row may say AGPL-3.0 only because the repository is licensed so.
		const licence = readFileSync(resolve(__dirname, "../../LICENSE"), "utf8");
		expect(licence).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
		expect(screen.getByText(/^AGPL-3\.0/)).toBeTruthy();
	});
});

describe("landing pricing", () => {
	it("splits the product in two columns and quotes no price", () => {
		const { container } = render(<PricingSection />);

		expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
			"On your machine",
			"Hosted",
		]);
		expect(container.textContent).not.toMatch(/[$€£]\s?\d|\d\s?(?:USD|EUR)|\/\s?mo/i);
		// The close below is the zone's one filled action.
		expect(container.querySelector("a, button")).toBeNull();
	});
});
