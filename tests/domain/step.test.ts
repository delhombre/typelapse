import { MAX_ANNOTATION_LENGTH, Step, captionFromGeneratedLabel } from "@/domain/entities/step";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { describe, expect, it } from "vitest";

describe("captionFromGeneratedLabel", () => {
	it("passes a label that already fits straight through, trimmed", () => {
		expect(captionFromGeneratedLabel("  Change 3  ")).toBe("Change 3");
		expect(captionFromGeneratedLabel("a".repeat(MAX_ANNOTATION_LENGTH))).toHaveLength(
			MAX_ANNOTATION_LENGTH,
		);
	});

	it("treats an absent or blank label as no caption", () => {
		expect(captionFromGeneratedLabel(undefined)).toBeUndefined();
		expect(captionFromGeneratedLabel("   ")).toBeUndefined();
	});

	it("ellipsises an over-long label to exactly the bound", () => {
		const caption = captionFromGeneratedLabel("x".repeat(MAX_ANNOTATION_LENGTH + 50));

		expect(caption).toHaveLength(MAX_ANNOTATION_LENGTH);
		expect(caption?.endsWith("…")).toBe(true);
	});

	it("produces a caption the factory accepts", () => {
		const caption = captionFromGeneratedLabel("y".repeat(MAX_ANNOTATION_LENGTH * 3));

		expect(() => Step.create({ code: "x", annotation: caption })).not.toThrow();
	});

	it("does not leave a dangling space before the ellipsis", () => {
		// The cut can land mid-space; trimming keeps "word …" from reading as a typo.
		const label = `${"z".repeat(MAX_ANNOTATION_LENGTH - 1)}   tail`;

		expect(captionFromGeneratedLabel(label)).toBe(`${"z".repeat(MAX_ANNOTATION_LENGTH - 1)}…`);
	});
});

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

	it("takes empty code as a blank step, whose scene has no code card", () => {
		const blank = Step.create({ code: "", annotation: "Launch day" });
		expect(blank.code).toBe("");
		expect(blank.hasCode).toBe(false);
		expect(blank.annotation).toBe("Launch day");
		// Whitespace draws nothing either: it is the same blank step, not a card
		// with no text in it.
		expect(Step.create({ code: "  \n " }).code).toBe("");
		expect(Step.create({ code: "x" }).hasCode).toBe(true);
	});

	it("keeps a blank step blank through an edit", () => {
		const blank = Step.create({ code: "" });
		const edited = blank.with({ duration: 2500 });
		expect(edited.id).toBe(blank.id);
		expect(edited.hasCode).toBe(false);
	});

	it("rejects non-positive duration", () => {
		expect(() => Step.create({ code: "x", duration: 0 })).toThrow();
		expect(() => Step.create({ code: "x", duration: -100 })).toThrow();
	});

	it("rejects an annotation longer than the single line the layout reserves", () => {
		expect(() =>
			Step.create({ code: "x", annotation: "a".repeat(MAX_ANNOTATION_LENGTH + 1) }),
		).toThrow();
		expect(() =>
			Step.create({ code: "x", annotation: "a".repeat(MAX_ANNOTATION_LENGTH) }),
		).not.toThrow();
	});

	it("trims surrounding whitespace off the annotation", () => {
		expect(Step.create({ code: "x", annotation: "  spaced  " }).annotation).toBe("spaced");
	});

	it("treats a whitespace-only annotation as absent", () => {
		expect(Step.create({ code: "x", annotation: "   " }).annotation).toBeUndefined();
	});
});

describe("Step scene break (#280)", () => {
	it("morphs from the step before by default", () => {
		expect(Step.create({ code: "a" }).sceneBreak).toBe(false);
	});

	it("keeps a scene break through an edit: the step still opens its scene", () => {
		const step = Step.create({ code: "a", sceneBreak: true });
		expect(step.with({ code: "b", duration: 2000 }).sceneBreak).toBe(true);
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

	it("enforces the annotation bound on edits too", () => {
		expect(() => base.with({ annotation: "a".repeat(MAX_ANNOTATION_LENGTH + 1) })).toThrow();
	});

	it("validates like create", () => {
		expect(base.with({ code: "  " }).hasCode).toBe(false);
		expect(() => base.with({ duration: 0 })).toThrow();
	});
});
