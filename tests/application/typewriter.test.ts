import type { RawToken } from "@/application/magic-move/engine";
import {
	layoutTypingTokens,
	renderTyping,
	typedCharCount,
} from "@/application/magic-move/typewriter";
import { describe, expect, it } from "vitest";

function raw(key: string, content: string, offset: number): RawToken {
	return { key, content, offset, color: "#fff" };
}

describe("layoutTypingTokens", () => {
	it("keeps whitespace tokens and records start indices", () => {
		const code = "  a";
		const laid = layoutTypingTokens(code, [raw("ws", "  ", 0), raw("a", "a", 2)]);
		expect(laid).toHaveLength(2);
		expect(laid[1]).toMatchObject({ content: "a", col: 2, startChar: 2 });
	});
});

describe("renderTyping", () => {
	const code = "const x";
	const tokens = layoutTypingTokens(code, [
		raw("k", "const", 0),
		raw("ws", " ", 5),
		raw("x", "x", 6),
	]);

	it("reveals nothing at 0 characters", () => {
		expect(renderTyping(code, tokens, 0).tokens).toHaveLength(0);
	});

	it("slices the token currently being typed", () => {
		const view = renderTyping(code, tokens, 3);
		expect(view.tokens).toHaveLength(1);
		expect(view.tokens[0]?.content).toBe("con");
	});

	it("reveals the whole frame once fully typed", () => {
		const view = renderTyping(code, tokens, code.length);
		const text = view.tokens.map((t) => t.content).join("");
		expect(text).toBe("const x");
	});

	it("advances the cursor with the reveal", () => {
		const early = renderTyping(code, tokens, 2).cursor;
		const late = renderTyping(code, tokens, 6).cursor;
		expect(early?.col).toBe(2);
		expect(late?.col).toBe(6);
	});

	it("moves the cursor to the next line after a newline", () => {
		const multi = "a\nb";
		const laid = layoutTypingTokens(multi, [raw("a", "a", 0), raw("b", "b", 2)]);
		expect(renderTyping(multi, laid, 3).cursor).toMatchObject({ line: 1, col: 1 });
	});
});

describe("typedCharCount", () => {
	it("is zero at the start and full by the completion point", () => {
		expect(typedCharCount(10, 0)).toBe(0);
		expect(typedCharCount(10, 0.85, 0.85)).toBe(10);
		expect(typedCharCount(10, 1, 0.85)).toBe(10);
	});
});
