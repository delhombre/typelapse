import { FrameFan } from "@/presentation/landing/frame-fan";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing frame fan", () => {
	it("keeps the fan off tablet widths, where it is wider than the page", () => {
		const { container } = render(<FrameFan />);
		const [fan, row] = Array.from(container.querySelectorAll("section > div"));
		if (!fan || !row) {
			throw new Error("FrameFan should render the fan and the snap row");
		}

		// The fanned hand spans about 840px between its outer rotated corners. At
		// `md` (768px) it overflowed the viewport and scrolled the whole landing
		// sideways, so it waits for `lg` and the snap row covers everything below.
		expect(fan.className).toContain("lg:block");
		expect(fan.className).not.toContain("md:block");
		expect(row.className).toContain("lg:hidden");
		expect(row.className).not.toContain("md:hidden");
	});
});

describe("landing frame fan, phone row", () => {
	it("names the scroll row it puts in the tab order", () => {
		const { getByRole } = render(<FrameFan />);

		// The row scrolls sideways with no arrows, so the keyboard reaches its
		// cards by focusing the row itself. Chrome already makes it a tab stop,
		// and a tab stop with no role and no name is announced as nothing.
		const row = getByRole("region", { name: "Export ratios" });
		expect(row.className).toContain("snap-x");
		expect(row.tabIndex).toBe(0);
	});
});
