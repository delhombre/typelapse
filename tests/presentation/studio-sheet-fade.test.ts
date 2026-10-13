import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Whitespace collapsed: the formatter wraps a long selector over several lines.
const CSS = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8").replace(/\s+/g, " ");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
	const start = CSS.indexOf(`${selector} {`);
	if (start < 0) {
		throw new Error(`no rule for ${selector}`);
	}
	return CSS.slice(start, CSS.indexOf("}", start));
}

describe("the phone sheet's fades (#272)", () => {
	it("dissolves the foot only while there are rows left to scroll to", () => {
		expect(rule('.sc-root-mobile .si-sheet-body[data-more-below="true"]')).toContain(
			"--si-sheet-fade-end: 16px",
		);
		expect(rule(".sc-root-mobile .si-sheet-body")).toContain("--si-sheet-fade-end: 0px");
	});

	it("veils the row above the pinned footer only while rows are still under it", () => {
		const resting = rule(
			'.sc-root-mobile .si-sheet-body[data-roomy="true"] .si-cluster-footer::before',
		);
		expect(resting).toContain("opacity: 0");

		const scrolling = rule(
			'.sc-root-mobile .si-sheet-body[data-roomy="true"][data-more-below="true"] .si-cluster-footer::before',
		);
		expect(scrolling).toContain("opacity: 1");
	});
});
