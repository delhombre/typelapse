// @vitest-environment node
/**
 * The studio's keyer: the shared plan walk on a real Shiki highlighter, with a
 * cache by content so an edit re-tokenizes only the code that changed. Every
 * keystroke rebuilds the plan, and every step used to be tokenized again.
 */

import { ensureReadableTokenColor } from "@/application/accessibility/token-contrast";
import { frameLineCount, layoutFrame } from "@/application/magic-move/engine";
import { layoutTypingTokens } from "@/application/magic-move/typewriter";
import { codePointWidth } from "@/application/text/display-width";
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

	it("places a long file's window on the focus band it is given", () => {
		const long = Array.from({ length: 3_000 }, (_, i) => `const line${i + 1} = ${i + 1};`);
		const edited = long.map((line, i) => (i === 1407 ? "const line1408 = 'edited';" : line));
		const plan = buildMagicMovePlan(
			highlighter,
			[long.join("\n"), edited.join("\n")],
			"typescript",
			"midnight",
			BG,
			false,
			[new Set([1400, 1401, 1402]), undefined],
		);
		expect(plan.frames[0]?.firstRow).toBe(1391);
		const row1408 = plan.frames[1]?.tokens.filter((token) => token.line === 1407);
		expect(row1408?.map((token) => token.content).join("")).toContain("'edited'");
	});

	it("glides shared tokens between frames with wide characters, on display cells", () => {
		const from = 'const msg = "こんにちは世界 🚀 naïve café";';
		const to = 'const message = "こんにちは世界 🚀 naïve café";';
		const plan = buildMagicMovePlan(highlighter, [from, to], "typescript", "midnight", BG);
		const morph = plan.transitions[0];
		const semiFrom = morph?.from.find((token) => token.content === ";");
		const semiTo = morph?.to.find((token) => token.content === ";");
		// One key across the morph, so the `;` glides rather than fading out and in.
		expect(semiFrom?.key).toBe(semiTo?.key);
		// After `café"`, counting the seven CJK characters and the rocket twice.
		expect(semiFrom?.col).toBe(13 + 28 + 1);
		expect(semiTo?.col).toBe(17 + 28 + 1);
	});

	it("never cuts a glyph in two where a diff edge falls inside it", () => {
		const codes = [
			'const a = "🚀 launch";',
			'const a = "😀 launch";',
			'const a = "👨\u200d👩\u200d👧 launch";',
			'const a = "cafe\u0301 launch";',
			'const a = "cafe\u0300 launch";',
		];
		const plan = buildMagicMovePlan(highlighter, codes, "typescript", "midnight", BG, true);
		const morphs = [...plan.transitions, plan.loopTransition];
		const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
		for (const morph of morphs) {
			for (const token of [...(morph?.from ?? []), ...(morph?.to ?? [])]) {
				expect(token.content, JSON.stringify(token.content)).not.toMatch(loneSurrogate);
				// Nor does a token start on a mark or modifier that belongs to the glyph before.
				const first = token.content.codePointAt(0) ?? 0;
				expect(codePointWidth(first), JSON.stringify(token.content)).not.toBe(0);
				expect(first >= 0x1f3fb && first <= 0x1f3ff).toBe(false);
			}
		}
	});
});
