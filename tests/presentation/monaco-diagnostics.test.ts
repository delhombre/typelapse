import { ELLIPSIS } from "@/application/diff/windowing";
import { SNIPPET_DIAGNOSTICS } from "@/presentation/components/editor/monaco-language";
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
});
