import { ensureReadableTokenColor } from "@/application/accessibility/token-contrast";
import {
	type MagicMovePlan,
	type RawToken,
	frameLineCount,
	layoutFrame,
} from "@/application/magic-move/engine";
import { layoutTypingTokens } from "@/application/magic-move/typewriter";
import type { BundledLanguage, Highlighter } from "shiki";
import { codeToKeyedTokens, syncTokenKeys } from "shiki-magic-move/core";
import type { KeyedTokensInfo } from "shiki-magic-move/types";
import { resolveShikiLanguage, resolveShikiTheme } from "./shiki-registry";

export type { MagicMovePlan } from "@/application/magic-move/engine";

function toRawTokens(info: KeyedTokensInfo, background: string): RawToken[] {
	return info.tokens.map((token) => ({
		key: token.key,
		content: token.content,
		offset: token.offset,
		color: token.color ? ensureReadableTokenColor(token.color, background) : token.color,
		fontStyle: token.fontStyle,
	}));
}

/**
 * Tokenize every step and diff each adjacent pair so shared tokens keep a stable
 * key across frames. The result feeds the pure engine identically on the client
 * (preview) and the server (video), so the two always match.
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
): MagicMovePlan {
	// `resolveShikiLanguage` yields a loaded bundled id or the special `text` lang.
	const options = {
		lang: resolveShikiLanguage(language) as BundledLanguage,
		theme: resolveShikiTheme(themeName),
	};
	const tokenize = (code: string) => codeToKeyedTokens(highlighter, code, options, false);
	// Match same-content tokens and split at diff edges so unchanged code stays
	// put (no flicker) and only the genuinely edited tokens enter/leave.
	const diffOptions = { enhanceMatching: true, splitTokens: true } as const;
	const morph = (fromCode: string, toCode: string): MagicMovePlan["transitions"][number] => {
		const { from, to } = syncTokenKeys(tokenize(fromCode), tokenize(toCode), diffOptions);
		return {
			from: layoutFrame(fromCode, toRawTokens(from, themeBackground)),
			to: layoutFrame(toCode, toRawTokens(to, themeBackground)),
		};
	};

	const frames: MagicMovePlan["frames"] = codes.map((code) => ({
		tokens: layoutFrame(code, toRawTokens(tokenize(code), themeBackground)),
		lineCount: frameLineCount(code),
	}));

	const transitions: MagicMovePlan["transitions"] = [];
	for (let i = 0; i < codes.length - 1; i++) {
		transitions.push(morph(codes[i] ?? "", codes[i + 1] ?? ""));
	}

	const last = codes.length - 1;
	const loopTransition =
		loop && codes.length >= 2 ? morph(codes[last] ?? "", codes[0] ?? "") : undefined;

	const firstCode = codes[0] ?? "";
	const typing = layoutTypingTokens(firstCode, toRawTokens(tokenize(firstCode), themeBackground));

	return { frames, transitions, loopTransition, typing };
}
