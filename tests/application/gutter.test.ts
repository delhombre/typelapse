import { gutterLabels } from "@/application/line-numbers/gutter";
import { describe, expect, it } from "vitest";

describe("gutterLabels", () => {
	it("zero-pads to two digits from line 1", () => {
		expect(gutterLabels(1, 3)).toEqual(["01", "02", "03"]);
	});

	it("offsets every label by the start line", () => {
		expect(gutterLabels(5, 3)).toEqual(["05", "06", "07"]);
	});

	it("rolls into three digits without truncating the pad", () => {
		expect(gutterLabels(9, 3)).toEqual(["09", "10", "11"]);
		expect(gutterLabels(98, 3)).toEqual(["98", "99", "100"]);
	});

	it("returns no labels for a zero count", () => {
		expect(gutterLabels(1, 0)).toEqual([]);
	});

	it("clamps a start below 1 up to 1", () => {
		expect(gutterLabels(0, 2)).toEqual(["01", "02"]);
		expect(gutterLabels(-4, 1)).toEqual(["01"]);
	});

	it("floors fractional start and count defensively", () => {
		expect(gutterLabels(2.8, 2.9)).toEqual(["02", "03"]);
	});
});
