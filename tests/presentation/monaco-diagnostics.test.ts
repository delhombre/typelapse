import { ELLIPSIS } from "@/application/diff/windowing";
import {
	SNIPPET_DIAGNOSTICS,
	snippetDiagnostics,
} from "@/presentation/components/editor/monaco-language";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("what the editor underlines in a snippet", () => {
	it("lets the separator of a windowed import through: the compiler reads it as an invalid character", () => {
		const file = ts.createSourceFile(
			"a.ts",
			`const a = 1;\n${ELLIPSIS}\nconst b = 2;\n`,
			ts.ScriptTarget.ESNext,
		);
		const codes = (
			file as unknown as { parseDiagnostics: { code: number }[] }
		).parseDiagnostics.map((diagnostic) => diagnostic.code);

		expect(codes.length).toBeGreaterThan(0);
		for (const code of codes) {
			expect(SNIPPET_DIAGNOSTICS.diagnosticCodesToIgnore).toContain(code);
		}
	});

	it("keeps the author's real syntax errors", () => {
		expect(SNIPPET_DIAGNOSTICS.noSyntaxValidation).toBe(false);
		expect(SNIPPET_DIAGNOSTICS.diagnosticCodesToIgnore).toEqual([1127]);
	});

	describe("a windowed import", () => {
		// What a pull request import holds: excerpts cut at the diff's boundaries.
		const windowed = `  expect(a).toBe(1)\n})\n${ELLIPSIS}\n  expect(b).toBe(2)\n})\n`;

		it("is read by the compiler as statements nobody wrote", () => {
			const file = ts.createSourceFile("a.tsx", windowed, ts.ScriptTarget.ESNext);
			const codes = (
				file as unknown as { parseDiagnostics: { code: number }[] }
			).parseDiagnostics.map((diagnostic) => diagnostic.code);

			expect(codes).toContain(1128);
		});

		it("goes quiet on syntax while a separator line is in the code", () => {
			expect(snippetDiagnostics(windowed).noSyntaxValidation).toBe(true);
			expect(snippetDiagnostics(`a()\n  ${ELLIPSIS}  \nb()`).noSyntaxValidation).toBe(true);
		});

		it("keeps every other diagnostic setting", () => {
			expect(snippetDiagnostics(windowed)).toEqual({
				...SNIPPET_DIAGNOSTICS,
				noSyntaxValidation: true,
			});
		});
	});

	it("keeps syntax errors for an ordinary snippet, even one that mentions the mark", () => {
		expect(snippetDiagnostics("const a = 1;\n})\n").noSyntaxValidation).toBe(false);
		expect(snippetDiagnostics("").noSyntaxValidation).toBe(false);
		expect(snippetDiagnostics(`const dots = "${ELLIPSIS}";`).noSyntaxValidation).toBe(false);
	});
});
