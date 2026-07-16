import type { Highlighter } from "shiki";
import { codeToKeyedTokens, syncTokenKeys } from "shiki-magic-move/core";
import type { KeyedTokensInfo } from "shiki-magic-move/types";
import {
	type MagicMovePlan,
	type RawToken,
	frameLineCount,
	layoutFrame,
} from "../../src/application/magic-move/engine";
import { layoutTypingTokens } from "../../src/application/magic-move/typewriter";

function toRawTokens(info: KeyedTokensInfo): RawToken[] {
	return info.tokens.map((token) => ({
		key: token.key,
		content: token.content,
		offset: token.offset,
		color: token.color,
		fontStyle: token.fontStyle,
	}));
}

/**
 * Server twin of the client magic-move keyer: tokenizes every step, diffs each
 * adjacent pair for stable keys, and lays the tokens out with the same pure
 * engine the browser preview uses, so the exported video matches the preview.
 *
 * The highlighter must already have `lang`/`shikiTheme` loaded.
 */
export function buildServerMagicMovePlan(
	highlighter: Highlighter,
	codes: string[],
	lang: string,
	shikiTheme: string,
	loop = false,
): MagicMovePlan {
	const options = { lang, theme: shikiTheme } as Parameters<typeof highlighter.codeToTokens>[1];
	const tokenize = (code: string) => codeToKeyedTokens(highlighter, code, options, false);
	// Keep unchanged code stable across a morph; only edited tokens enter/leave.
	const diffOptions = { enhanceMatching: true, splitTokens: true } as const;
	const morph = (fromCode: string, toCode: string): MagicMovePlan["transitions"][number] => {
		const { from, to } = syncTokenKeys(tokenize(fromCode), tokenize(toCode), diffOptions);
		return {
			from: layoutFrame(fromCode, toRawTokens(from)),
			to: layoutFrame(toCode, toRawTokens(to)),
		};
	};

	const frames: MagicMovePlan["frames"] = codes.map((code) => ({
		tokens: layoutFrame(code, toRawTokens(tokenize(code))),
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
	const typing = layoutTypingTokens(firstCode, toRawTokens(tokenize(firstCode)));

	return { frames, transitions, loopTransition, typing };
}
