import { monacoLanguage, monacoWorkerKind } from "@/presentation/components/editor/monaco-language";
import { describe, expect, it } from "vitest";

/**
 * The snippet's language is a Shiki id, because Shiki renders the thing being
 * sold: the video. Monaco names a few of them differently, and misses others
 * entirely. Left unmapped, a React template opens in an editor with no colour
 * at all, which reads as broken.
 */
describe("monacoLanguage", () => {
	it("passes through the ids Monaco already agrees on", () => {
		expect(monacoLanguage("typescript")).toBe("typescript");
		expect(monacoLanguage("python")).toBe("python");
		expect(monacoLanguage("rust")).toBe("rust");
	});

	it("folds the React dialects onto their base language", () => {
		// Monaco's TypeScript mode parses JSX; it just has no separate id for it.
		expect(monacoLanguage("tsx")).toBe("typescript");
		expect(monacoLanguage("jsx")).toBe("javascript");
	});

	it("falls back to plain text for grammars Monaco does not ship", () => {
		// Better an honestly uncoloured editor than a wrong grammar. The preview
		// still shows the real diff colours, through Shiki.
		expect(monacoLanguage("diff")).toBe("plaintext");
	});

	it("leaves anything unrecognised to Monaco's own fallback", () => {
		expect(monacoLanguage("brainfuck")).toBe("brainfuck");
	});
});

/**
 * Monaco asks for a worker by the label of the language it is starting, and the
 * TypeScript one is 1.5 MB gzipped: it must be the answer for TypeScript and
 * JavaScript and for nothing else, or a Python snippet pays for it.
 */
describe("monacoWorkerKind", () => {
	it("gives the TypeScript worker to TypeScript and JavaScript only", () => {
		expect(monacoWorkerKind("typescript")).toBe("typescript");
		expect(monacoWorkerKind("javascript")).toBe("typescript");
		for (const label of ["python", "rust", "go", "plaintext", "markdown", "yaml", "sql", ""]) {
			expect(monacoWorkerKind(label)).not.toBe("typescript");
		}
	});

	it("keeps the language services of JSON, CSS and HTML on their own workers", () => {
		expect(monacoWorkerKind("json")).toBe("json");
		expect(monacoWorkerKind("css")).toBe("css");
		expect(monacoWorkerKind("scss")).toBe("css");
		expect(monacoWorkerKind("less")).toBe("css");
		expect(monacoWorkerKind("html")).toBe("html");
		expect(monacoWorkerKind("handlebars")).toBe("html");
		expect(monacoWorkerKind("razor")).toBe("html");
	});

	it("falls back to the editor worker, the one every model needs", () => {
		expect(monacoWorkerKind("python")).toBe("editor");
		expect(monacoWorkerKind("anything else")).toBe("editor");
	});
});
