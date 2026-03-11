import { Step } from "@/domain/entities/step";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { describe, expect, it } from "vitest";

describe("Step", () => {
	it("creates a step with code and default duration", () => {
		const step = Step.create({ code: "const x = 1;" });

		expect(step.id).toBeDefined();
		expect(step.code).toBe("const x = 1;");
		expect(step.duration).toBe(1000);
		expect(step.highlightRanges).toEqual([]);
		expect(step.annotation).toBeUndefined();
	});

	it("creates a step with custom duration", () => {
		const step = Step.create({ code: "const x = 1;", duration: 2000 });

		expect(step.duration).toBe(2000);
	});

	it("creates a step with highlight ranges", () => {
		const range = HighlightRange.create({ startLine: 1, endLine: 3 });
		const step = Step.create({
			code: "line1\nline2\nline3",
			highlightRanges: [range],
		});

		expect(step.highlightRanges).toHaveLength(1);
		expect(step.highlightRanges[0]?.startLine).toBe(1);
	});

	it("creates a step with annotation", () => {
		const step = Step.create({
			code: "const x = 1;",
			annotation: "Declare variable",
		});

		expect(step.annotation).toBe("Declare variable");
	});

	it("rejects empty code", () => {
		expect(() => Step.create({ code: "" })).toThrow();
		expect(() => Step.create({ code: "   " })).toThrow();
	});

	it("rejects non-positive duration", () => {
		expect(() => Step.create({ code: "x", duration: 0 })).toThrow();
		expect(() => Step.create({ code: "x", duration: -100 })).toThrow();
	});
});
