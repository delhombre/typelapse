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

describe("Step.with", () => {
	const base = Step.create({
		code: "const x = 1;",
		duration: 1500,
		highlightRanges: [HighlightRange.create({ startLine: 1, endLine: 2 })],
		annotation: "declare",
	});

	it("preserves the step id across an edit", () => {
		expect(base.with({ duration: 2000 }).id).toBe(base.id);
		expect(base.with({ annotation: "renamed" }).id).toBe(base.id);
		expect(base.with({ highlightRanges: [] }).id).toBe(base.id);
	});

	it("applies the requested change and keeps every other field", () => {
		const edited = base.with({ duration: 2000 });

		expect(edited.duration).toBe(2000);
		expect(edited.code).toBe(base.code);
		expect(edited.highlightRanges).toEqual(base.highlightRanges);
		expect(edited.annotation).toBe("declare");
	});

	it("returns a new instance, leaving the original untouched", () => {
		const edited = base.with({ duration: 2000 });

		expect(edited).not.toBe(base);
		expect(base.duration).toBe(1500);
	});

	it("clears the annotation when explicitly set to undefined", () => {
		expect(base.with({ annotation: undefined }).annotation).toBeUndefined();
	});

	it("keeps the annotation when the change does not mention it", () => {
		expect(base.with({ highlightRanges: [] }).annotation).toBe("declare");
	});

	it("validates like create", () => {
		expect(() => base.with({ code: "  " })).toThrow();
		expect(() => base.with({ duration: 0 })).toThrow();
	});
});
