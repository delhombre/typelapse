/**
 * The magic-move plan, built once for both keyers: the studio's
 * (`infrastructure/highlighting/magic-move-keyer`) and the server's
 * (`server/remotion/magic-move-plan`). They used to be two copies of this walk;
 * one walk is what keeps the preview, the painter and the server render on the
 * same frames, windowing included.
 *
 * The highlighter stays outside: a keyer hands in how to tokenize a code with
 * stable keys and how to sync the keys of two tokenizations, so this module
 * keeps the engine's rule of no dependencies.
 */

import { ensureReadableTokenColor } from "../accessibility/token-contrast";
import { VISIBLE_ROW_LIMIT } from "../layout/canvas-fit";
import { type MagicMovePlan, type RawToken, frameLineCount, layoutFrame } from "./engine";
import { layoutTypingTokens } from "./typewriter";

/** A tokenized code with keys: the shape of shiki-magic-move's `KeyedTokensInfo`. */
export interface KeyedSource {
	code: string;
	tokens: RawToken[];
}

export interface PlanKeyer<T extends KeyedSource> {
	tokenize(code: string): T;
	/** Give shared tokens one key across two frames. May rewrite keys in place. */
	sync(from: T, to: T): { from: T; to: T };
}

/**
 * The first `VISIBLE_ROW_LIMIT` lines of a code: everything a card can show at
 * the readable floor, plus the margin a morph glides through. Lines below never
 * reach a frame, so they are never tokenized. Highlighting runs top-down, so the
 * window highlights exactly as the full code does.
 */
export function visibleSource(code: string): string {
	let index = -1;
	for (let line = 0; line < VISIBLE_ROW_LIMIT; line++) {
		index = code.indexOf("\n", index + 1);
		if (index === -1) {
			return code;
		}
	}
	return code.slice(0, index);
}

/**
 * Tokenize every step and sync each adjacent pair so shared tokens keep one key
 * across frames, then lay them out with the pure engine. Each distinct code is
 * tokenized once; a morph syncs copies, because syncing rewrites keys and the
 * frames must keep their own.
 */
export function planMagicMove<T extends KeyedSource>(
	codes: string[],
	keyer: PlanKeyer<T>,
	themeBackground: string,
	loop = false,
): MagicMovePlan {
	const windowed = codes.map(visibleSource);
	const tokenized = new Map<string, T>();
	const tokenize = (code: string): T => {
		let source = tokenized.get(code);
		if (!source) {
			source = keyer.tokenize(code);
			tokenized.set(code, source);
		}
		return source;
	};
	const copy = (source: T): T => ({
		...source,
		tokens: source.tokens.map((token) => ({ ...token })),
	});
	const raw = (source: KeyedSource): RawToken[] =>
		source.tokens.map((token) => ({
			key: token.key,
			content: token.content,
			offset: token.offset,
			color: token.color ? ensureReadableTokenColor(token.color, themeBackground) : token.color,
			fontStyle: token.fontStyle,
		}));
	const morph = (fromCode: string, toCode: string): MagicMovePlan["transitions"][number] => {
		const { from, to } = keyer.sync(copy(tokenize(fromCode)), copy(tokenize(toCode)));
		return { from: layoutFrame(fromCode, raw(from)), to: layoutFrame(toCode, raw(to)) };
	};

	const frames: MagicMovePlan["frames"] = windowed.map((code) => ({
		tokens: layoutFrame(code, raw(tokenize(code))),
		lineCount: frameLineCount(code),
	}));

	const transitions: MagicMovePlan["transitions"] = [];
	for (let i = 0; i < windowed.length - 1; i++) {
		transitions.push(morph(windowed[i] ?? "", windowed[i + 1] ?? ""));
	}

	const last = windowed.length - 1;
	const loopTransition =
		loop && windowed.length >= 2 ? morph(windowed[last] ?? "", windowed[0] ?? "") : undefined;

	const firstCode = windowed[0] ?? "";
	const typing = layoutTypingTokens(firstCode, raw(tokenize(firstCode)));

	return { frames, transitions, loopTransition, typing };
}
