import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The skeleton's phone row is drawn from the real row's numbers (`.sc-corner-row`
 * in app.css, measured at 360, 390 and 430 in the design audit), so what replaces
 * it settles into the same boxes: chips of 67, 98 and 42px, the project chip taking
 * what is left, 10px at the edges and 8px between (4px under 390).
 */

const SKELETON = readFileSync(
	resolve(__dirname, "../../src/presentation/studio/studio-skeleton.css"),
	"utf8",
);
const APP = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");

const rule = (source: string, selector: string) =>
	source.match(new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}\\s*{([^}]*)}`))?.[1] ?? "";

describe("the skeleton's phone row", () => {
	it("keeps the width of the chips that do not give", () => {
		expect(rule(SKELETON, ".sk-history")).toMatch(/width:\s*67px/);
		expect(rule(SKELETON, ".sk-resources")).toMatch(/width:\s*98px/);
		expect(rule(SKELETON, ".sk-more")).toMatch(/width:\s*42px/);
	});

	it("lets the project chip take what is left, as the real one does", () => {
		expect(rule(SKELETON, ".sk-project")).toMatch(/flex:\s*1 1 auto/);
		expect(rule(APP, ".sc-corner-row .sc-project")).toMatch(/flex:\s*1 1 auto/);
	});

	it("starts 10px in and spaces the chips as the row does", () => {
		expect(rule(APP, ".sc-corner-row")).toMatch(/--row-gap:\s*8px/);
		expect(rule(SKELETON, ".sk-group-start")).toMatch(/gap:\s*8px/);
		expect(SKELETON).toMatch(/@media \(max-width: 389px\)\s*{\s*\.sk-group-start\s*{\s*gap:\s*4px/);
		expect(rule(SKELETON, ".sk-header")).toMatch(/max\(10px, env\(safe-area-inset-right\)\)/);
		expect(rule(SKELETON, ".sk-header")).toMatch(/max\(10px, env\(safe-area-inset-left\)\)/);
	});
});
