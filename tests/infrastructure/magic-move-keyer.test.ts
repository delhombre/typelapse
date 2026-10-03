// @vitest-environment node
/**
 * The studio's keyer: the shared plan walk on a real Shiki highlighter, with a
 * cache by content so an edit re-tokenizes only the code that changed. Every
 * keystroke rebuilds the plan, and every step used to be tokenized again.
 */

import { ensureReadableTokenColor } from "@/application/accessibility/token-contrast";
import { frameLineCount, layoutFrame } from "@/application/magic-move/engine";
import { layoutTypingTokens } from "@/application/magic-move/typewriter";
import { buildMagicMovePlan } from "@/infrastructure/highlighting/magic-move-keyer";
import { type Highlighter, createHighlighter } from "shiki";
import { codeToKeyedTokens, syncTokenKeys } from "shiki-magic-move/core";
import type { KeyedTokensInfo } from "shiki-magic-move/types";
import { beforeAll, describe, expect, it, vi } from "vitest";

const BG = "#0d1117";
const A = "function greet(name: string) {\n  return name;\n}";
const B = "function greet(name: string) {\n  return `Hi ${name}`;\n}";
const C = 'console.log(greet("Typelapse"));';

let highlighter: Highlighter;
beforeAll(async () => {
	highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["typescript"] });
});

/** The plan exactly as the keyer built it before the shared walk and the cache. */
function referencePlan(codes: string[], loop: boolean) {
	const options = { lang: "typescript" as const, theme: "github-dark" };
	const tokenize = (code: string) => codeToKeyedTokens(highlighter, code, options, false);
	const raw = (info: KeyedTokensInfo) =>
		info.tokens.map((token) => ({
			key: token.key,
			content: token.content,
			offset: token.offset,
			color: token.color ? ensureReadableTokenColor(token.color, BG) : token.color,
			fontStyle: token.fontStyle,
		}));
	const morph = (from: string, to: string) => {
		const synced = syncTokenKeys(tokenize(from), tokenize(to), {
			enhanceMatching: true,
			splitTokens: true,
		});
		return { from: layoutFrame(from, raw(synced.from)), to: layoutFrame(to, raw(synced.to)) };
	};
	return {
		frames: codes.map((code) => ({
			tokens: layoutFrame(code, raw(tokenize(code))),
			lineCount: frameLineCount(code),
		})),
		transitions: codes.slice(1).map((code, i) => morph(codes[i] ?? "", code)),
		loopTransition: loop ? morph(codes[codes.length - 1] ?? "", codes[0] ?? "") : undefined,
		typing: layoutTypingTokens(codes[0] ?? "", raw(tokenize(codes[0] ?? ""))),
	};
}

describe("buildMagicMovePlan", () => {
	it("builds a short scene exactly as before", () => {
		const plan = buildMagicMovePlan(highlighter, [A, B, C], "typescript", "midnight", BG, true);
		expect(plan).toEqual(referencePlan([A, B, C], true));
	});

	it("re-tokenizes only the code an edit changed", () => {
		const spy = vi.spyOn(highlighter, "codeToTokens");
		buildMagicMovePlan(highlighter, [A, B], "typescript", "midnight", BG, true);
		spy.mockClear();
		const edited = `${B}\n`;
		const plan = buildMagicMovePlan(highlighter, [A, edited], "typescript", "midnight", BG, true);
		expect(spy.mock.calls.map(([code]) => code)).toEqual([edited]);
		expect(plan).toEqual(referencePlan([A, edited], true));
		spy.mockRestore();
	});
});
