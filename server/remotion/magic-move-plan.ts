import type { Highlighter } from "shiki";
import { codeToKeyedTokens, syncTokenKeys } from "shiki-magic-move/core";
import type { MagicMovePlan } from "../../src/application/magic-move/engine";
import { planMagicMove } from "../../src/application/magic-move/plan";
import { keepGlyphsWhole } from "../../src/application/magic-move/whole-glyph-diff";

/**
 * Server twin of the client magic-move keyer: the same plan walk
 * (`application/magic-move/plan`, windowing included) on the server's
 * highlighter, so the exported video matches the preview.
 *
 * The highlighter must already have `lang`/`shikiTheme` loaded.
 */
export function buildServerMagicMovePlan(
	highlighter: Highlighter,
	codes: string[],
	lang: string,
	shikiTheme: string,
	themeBackground: string,
	loop = false,
	/** Each step's 1-indexed focused lines: where a long file's window goes. */
	focus: readonly (Iterable<number> | undefined)[] = [],
): MagicMovePlan {
	const options = { lang, theme: shikiTheme } as Parameters<typeof highlighter.codeToTokens>[1];
	// Keep unchanged code stable across a morph; only edited tokens enter/leave.
	// Diff edges move onto glyph edges, so a cut never halves an emoji.
	const diffOptions = {
		enhanceMatching: true,
		splitTokens: true,
		diffCleanup: keepGlyphsWhole,
	} as const;
	return planMagicMove(
		codes,
		{
			tokenize: (code) => codeToKeyedTokens(highlighter, code, options, false),
			sync: (from, to) => syncTokenKeys(from, to, diffOptions),
		},
		themeBackground,
		loop,
		focus,
	);
}
