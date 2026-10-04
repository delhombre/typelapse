import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import {
	MAX_IMPORTED_CODE_CHARACTERS,
	MAX_IMPORTED_CODE_LINES,
	MAX_IMPORTED_STEPS,
	MAX_IMPORTED_STEP_DURATION_MS,
	type ProjectDocumentV1,
	assertImportableCode,
	parseProjectDocument,
} from "@/application/project/project-document";
import { MAX_STEP_DURATION_MS } from "@/application/studio-timeline/model";
import { describe, expect, it } from "vitest";

/**
 * A project file is untrusted input that the Studio autosaves as its draft the
 * moment it loads. Whatever the lenient V1 reader lets through is therefore
 * replayed on every boot: a 1e15 ms step crashed the timeline on each reload,
 * and a fractional duration or a negative padding was accepted by the snippet
 * and refused by the V2 composition, leaving the import applied halfway.
 */

function legacy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		title: "Legacy",
		code: "const value = 1;",
		language: "typescript",
		themeName: "midnight",
		background: "mesh:solar",
		steps: [{ code: "const value = 1;", duration: 900 }],
		...overrides,
	};
}

function readV1(input: Record<string, unknown>): ProjectDocumentV1 {
	const parsed = parseProjectDocument(input);
	if (parsed.schemaVersion !== 1) {
		throw new Error("expected V1");
	}
	return parsed.document;
}

describe("V1 import bounds", () => {
	it("keeps the duration ceiling in step with the timeline editor", () => {
		expect(MAX_IMPORTED_STEP_DURATION_MS).toBe(MAX_STEP_DURATION_MS);
	});

	it("clamps an absurd step duration instead of building a 30,000-year timeline", () => {
		const document = readV1(legacy({ steps: [{ code: "a", duration: 1e15 }] }));
		expect(document.steps[0]?.duration).toBe(MAX_IMPORTED_STEP_DURATION_MS);
	});

	it("rounds a fractional duration to the whole milliseconds a scene requires", () => {
		const document = readV1(legacy({ steps: [{ code: "a", duration: 1500.5 }] }));
		expect(document.steps[0]?.duration).toBe(1501);
		expect(() => hydrateProjectDocument(migrateV1ToV2(document))).not.toThrow();
	});

	it("falls back on padding, radius and line numbers the V2 code block would refuse", () => {
		const document = readV1(
			legacy({ framePadding: -5000, borderRadius: -3, lineNumberStart: 1e300 }),
		);
		expect(document.framePadding).toBe(24);
		expect(document.borderRadius).toBeUndefined();
		expect(document.lineNumberStart).toBe(1);
		expect(() => hydrateProjectDocument(migrateV1ToV2(document))).not.toThrow();
	});

	it("refuses more steps than the Studio opens, before reading any of them", () => {
		const steps = Array.from({ length: MAX_IMPORTED_STEPS + 1 }, (_, index) => ({
			code: `const a = ${index};`,
			duration: 1000,
		}));
		expect(() => parseProjectDocument(legacy({ steps }))).toThrow(
			`Typelapse opens at most ${MAX_IMPORTED_STEPS}`,
		);
	});

	it("refuses code too long to highlight on the main thread", () => {
		const longCode = Array.from({ length: MAX_IMPORTED_CODE_LINES + 1 }, () => "x").join("\n");
		expect(() => parseProjectDocument(legacy({ code: longCode }))).toThrow("too long to animate");
		expect(() =>
			parseProjectDocument(legacy({ steps: [{ code: longCode, duration: 1000 }] })),
		).toThrow("Step 1 is too long to animate");
	});

	it("refuses a single huge string and a project whose steps add up past the budget", () => {
		expect(() =>
			parseProjectDocument(legacy({ code: "a".repeat(MAX_IMPORTED_CODE_CHARACTERS + 1) })),
		).toThrow("too large to animate");

		const chunk = "b".repeat(Math.ceil(MAX_IMPORTED_CODE_CHARACTERS / 3));
		const steps = Array.from({ length: 4 }, () => ({ code: chunk, duration: 1000 }));
		expect(() => parseProjectDocument(legacy({ steps }))).toThrow("This project is too large");
	});

	it("accepts code right at the line bound", () => {
		const atBound = Array.from({ length: MAX_IMPORTED_CODE_LINES }, () => "x").join("\n");
		expect(() => assertImportableCode(atBound)).not.toThrow();
	});
});
