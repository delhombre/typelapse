// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FIGURES, LINE_LIMIT, bridge, lineCount } from "../../scripts/figures/bridge.mjs";

/**
 * Hairline's engine holds a figure to LINE_LIMIT lines, counted on the file its
 * `validate.mjs` reads: the TypeScript figure run through the bridge, types and
 * comments gone. Glide crossed it unseen (210, #293) because nothing counted.
 */
describe("the landing figures stay under hairline's line limit", () => {
	it("finds the five figures the page carries, so a sixth is a conscious addition", () => {
		expect([...FIGURES].sort()).toEqual(["glide", "local", "queue", "safezone", "scenes"]);
	});

	it.each(FIGURES)("%s bridges to fewer than the limit", async (name) => {
		const js = await bridge(name);

		expect(js).toContain("hairline({");
		expect(lineCount(js)).toBeLessThan(LINE_LIMIT);
	});
});
