import { ThemeToggle } from "@/presentation/landing/theme-toggle";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing theme toggle", () => {
	it("scrolls away with the page until the gutter can hold it", () => {
		const { getByRole } = render(<ThemeToggle theme="light" onToggle={() => {}} />);
		const classes = getByRole("button", { name: "Switch to dark theme" }).className.split(/\s+/);

		// Fixed, it rode over body text on every phone and tablet: the content
		// column reaches the corner it sat in. It belongs to the top of the page
		// there, and floats only where the column leaves it a gutter.
		expect(classes).toContain("absolute");
		expect(classes).not.toContain("fixed");
		expect(classes.some((c) => /^min-\[\d+px\]:fixed$/.test(c))).toBe(true);
	});
});
