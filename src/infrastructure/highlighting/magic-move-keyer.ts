import type { MagicMovePlan } from "@/application/magic-move/engine";
import { planMagicMove } from "@/application/magic-move/plan";
import { keepGlyphsWhole } from "@/application/magic-move/whole-glyph-diff";
import type { BundledLanguage, Highlighter } from "shiki";
import { codeToKeyedTokens, syncTokenKeys } from "shiki-magic-move/core";
import type { KeyedTokensInfo } from "shiki-magic-move/types";
import { resolveShikiLanguage, resolveShikiTheme } from "./shiki-registry";

export type { MagicMovePlan } from "@/application/magic-move/engine";

/**
 * Tokenizations by language, theme and code, across builds. The store rebuilds
 * the plan on every keystroke; with this, an edit tokenizes the one code it
 * changed and every other step comes back from here. Entries are never mutated:
 * the plan walk syncs copies. Bounded, oldest first, so a long session of edits
 * does not keep every intermediate code alive.
 */
const TOKENIZED_LIMIT = 64;
const tokenized = new Map<string, KeyedTokensInfo>();

function tokenizeOnce(
	highlighter: Highlighter,
	code: string,
	options: { lang: BundledLanguage; theme: string },
): KeyedTokensInfo {
	const key = `${options.lang}\u0000${options.theme}\u0000${code}`;
	const hit = tokenized.get(key);
	if (hit) {
		// Refresh its place so the codes in use are the last to be evicted.
		tokenized.delete(key);
		tokenized.set(key, hit);
		return hit;
	}
	const info = codeToKeyedTokens(highlighter, code, options, false);
	tokenized.set(key, info);
	if (tokenized.size > TOKENIZED_LIMIT) {
		const oldest = tokenized.keys().next().value;
		if (oldest !== undefined) {
			tokenized.delete(oldest);
		}
	}
	return info;
}

/**
 * Tokenize every step and diff each adjacent pair so shared tokens keep a stable
 * key across frames, through the plan walk the server shares
 * (`application/magic-move/plan`), so the preview and the video always match.
 *
 * The languages/themes must already be loaded on the highlighter.
 */
export function buildMagicMovePlan(
	highlighter: Highlighter,
	codes: string[],
	language: string,
	themeName: string,
	themeBackground: string,
	loop = false,
	/** Each step's 1-indexed focused lines: where a long file's window goes. */
	focus: readonly (Iterable<number> | undefined)[] = [],
	/** Whether each step opens a new scene: no token is matched across it (#280). */
	breaks: readonly boolean[] = [],
): MagicMovePlan {
	// `resolveShikiLanguage` yields a loaded bundled id or the special `text` lang.
	const options = {
		lang: resolveShikiLanguage(language) as BundledLanguage,
		theme: resolveShikiTheme(themeName),
	};
	// Match same-content tokens and split at diff edges so unchanged code stays
	// put (no flicker) and only the genuinely edited tokens enter/leave.
	// Diff edges move onto glyph edges, so a cut never halves an emoji.
	const diffOptions = {
		enhanceMatching: true,
		splitTokens: true,
		diffCleanup: keepGlyphsWhole,
	} as const;
	return planMagicMove(
		codes,
		{
			tokenize: (code) => tokenizeOnce(highlighter, code, options),
			sync: (from, to) => syncTokenKeys(from, to, diffOptions),
		},
		themeBackground,
		loop,
		focus,
		breaks,
	);
}
