import { ExportSection } from "@/presentation/landing/export-section";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing export section", () => {
	it("names the four formats once, in its line, and lets the fan show the shapes", () => {
		// The formats were said three times in one screen: the line, a chip row
		// under it, and the hero's meta. The chips added nothing the line did not.
		const { container } = render(<ExportSection />);
		const text = container.textContent ?? "";
		expect(text.match(/MP4/g)).toHaveLength(1);
		expect(text).toMatch(/MP4, WebM, GIF or PNG/);
		expect(container.querySelector('[role="region"][aria-label="Export ratios"]')).toBeTruthy();
	});
});
