import { monacoLanguage } from "@/presentation/components/editor/monaco-language";
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
