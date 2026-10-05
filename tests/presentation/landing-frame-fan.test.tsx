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

describe("landing frame fan, the code on each card", () => {
	it("fits the narrowest card, so no shape cuts the change off mid-token", async () => {
		const { FAN_CARDS, FAN_CODE, FAN_FONT, FAN_FRAME_PADDING, FAN_MESH_PADDING } = await import(
			"@/presentation/landing/frame-fan"
		);
		// A mono advance is at most 0.6em in the faces the page loads; the card
		// draws no line-number gutter, so the code owns the whole window width.
		const longest = Math.max(...FAN_CODE.split("\n").map((line) => line.length));
		const narrowest = Math.min(...FAN_CARDS.map((card) => card.width));
		const room = narrowest - 2 * (FAN_MESH_PADDING + FAN_FRAME_PADDING);
		expect(longest * 0.6 * FAN_FONT).toBeLessThanOrEqual(room);
	});

	it("draws the cards without the line-number gutter", () => {
		const { getByRole } = render(<FrameFan />);
		const row = getByRole("region", { name: "Export ratios" });
		for (const card of Array.from(row.children)) {
			expect(card.className).toContain("lp-nogutter");
		}
	});
});
