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
import { planWindowRows } from "./window";

/** A tokenized code with keys: the shape of shiki-magic-move's `KeyedTokensInfo`. */
export interface KeyedSource {
	code: string;
	tokens: RawToken[];
}

export interface PlanKeyer<T extends KeyedSource> {
	tokenize(code: string): T;
	/** Give shared tokens one key across two frames. May rewrite keys in place. */
	sync(from: T, to: T): { from: T; to: T };
	/**
	 * Whether `sync` is worth running on this pair. A pair it declines is planned as
	 * a scene break, nothing matched. Required, so a new keyer decides it: a diff
	 * that cannot match two huge lines within its time budget stalls a second per
	 * morph on every rebuild (#335). Pure in the two tokenizations, so the studio
	 * and the server decide alike.
	 */
	canSync(from: T, to: T): boolean;
}

/**
 * `VISIBLE_ROW_LIMIT` lines of a code from row `firstRow`: everything a card can
 * show at the readable floor, plus the margin a morph glides through, and the
 * index of the window's first character in the code. Lines outside never reach a
 * frame, so they are never tokenized. At the top the window highlights exactly
 * as the full code does; a window further down starts the grammar afresh, which
 * only shows inside a construct opened above it (a long block comment).
 */
export function visibleWindow(
	code: string,
	firstRow = 0,
	rows = VISIBLE_ROW_LIMIT,
): { code: string; start: number } {
	let start = 0;
	for (let row = 0; row < firstRow; row++) {
		const index = code.indexOf("\n", start);
		if (index === -1) {
			break;
		}
		start = index + 1;
	}
	let index = start - 1;
	for (let line = 0; line < rows; line++) {
		index = code.indexOf("\n", index + 1);
		if (index === -1) {
			return { code: code.slice(start), start };
		}
	}
	return { code: code.slice(start, index), start };
}

/** The first `VISIBLE_ROW_LIMIT` lines of a code: the window at the top. */
export function visibleSource(code: string): string {
	return visibleWindow(code).code;
}

/** Laid-out tokens of a window, moved to the absolute rows of the full code. */
function atRow<T extends { line: number }>(tokens: T[], firstRow: number): T[] {
	if (firstRow === 0) {
		return tokens;
	}
	for (const token of tokens) {
		token.line += firstRow;
	}
	return tokens;
}

/**
 * Tokenize every step and sync each adjacent pair so shared tokens keep one key
 * across frames, then lay them out with the pure engine. Each distinct code is
 * tokenized once; a morph syncs copies, because syncing rewrites keys and the
 * frames must keep their own.
 *
 * `focus` (each step's 1-indexed focused lines) is where a long file's window
 * goes (`planWindowRows`). Tokens are laid out on the full code's rows, so a
 * line two windows share sits on the same row in both and a morph between
 * them only scrolls.
 *
 * `breaks[i]` says step `i` opens a new scene (a page or a chapter of a diff,
 * #280): the pair before it is never synced, and each side's keys are made its
 * own, so no token glides across it. Every old token fades out and every new
 * one fades in, on the same timeline as a morph's fades. The loop back to the
 * first step crosses a break whenever any step after the first opens one.
 * A pair the keyer declines to sync (`canSync`, #335) is planned the same way.
 */
export function planMagicMove<T extends KeyedSource>(
	codes: string[],
	keyer: PlanKeyer<T>,
	themeBackground: string,
	loop = false,
	focus: readonly (Iterable<number> | undefined)[] = [],
	breaks: readonly boolean[] = [],
): MagicMovePlan {
	const rows = planWindowRows(codes, focus);
	const windows = codes.map((code, i) => visibleWindow(code, rows[i]));
	const windowed = windows.map((window) => window.code);
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
	// No colour is `undefined`, never Shiki's "": it gives the one token of a line
	// past `tokenizeMaxLineLength` an empty colour (#331), which the DOM reads as
	// "inherit" and the painter's `??` keeps, so the canvas would paint it in the
	// previous token's colour. Here the three renderers fall back to the foreground.
	const raw = (source: KeyedSource): RawToken[] =>
		source.tokens.map((token) => ({
			key: token.key,
			content: token.content,
			offset: token.offset,
			color: token.color ? ensureReadableTokenColor(token.color, themeBackground) : undefined,
			fontStyle: token.fontStyle,
		}));
	const opensScene = (index: number): boolean => index > 0 && breaks[index] === true;
	const breaksAnywhere = codes.some((_, index) => opensScene(index));
	// Each side laid out in its own window with keys only it holds: no sync, so
	// nothing is matched, and the prefixes keep two tokenizations from colliding.
	const sceneBreak = (fromIndex: number, toIndex: number): MagicMovePlan["transitions"][number] => {
		const side = (index: number, prefix: string) => {
			const code = windowed[index] ?? "";
			const tokens = raw(tokenize(code)).map((token) => ({
				...token,
				key: `${prefix}${token.key}`,
			}));
			return atRow(layoutFrame(code, tokens), rows[index] ?? 0);
		};
		return { from: side(fromIndex, "out:"), to: side(toIndex, "in:") };
	};

	// A morph lays both codes out over the union of the two windows, so a row
	// both show stays on screen while the window scrolls past it instead of
	// fading out as if it were deleted. Windows further apart than a window
	// share nothing worth the extra rows, and morph on their own.
	const morph = (fromIndex: number, toIndex: number): MagicMovePlan["transitions"][number] => {
		if (opensScene(toIndex) || (toIndex === 0 && breaksAnywhere)) {
			return sceneBreak(fromIndex, toIndex);
		}
		const fromRow = rows[fromIndex] ?? 0;
		const toRow = rows[toIndex] ?? 0;
		const top = Math.min(fromRow, toRow);
		const span = Math.max(fromRow, toRow) - top + VISIBLE_ROW_LIMIT;
		const union = span <= 2 * VISIBLE_ROW_LIMIT;
		const slice = (index: number) =>
			union ? visibleWindow(codes[index] ?? "", top, span).code : (windowed[index] ?? "");
		const fromCode = slice(fromIndex);
		const toCode = slice(toIndex);
		const fromSource = tokenize(fromCode);
		const toSource = tokenize(toCode);
		if (!keyer.canSync(fromSource, toSource)) {
			return sceneBreak(fromIndex, toIndex);
		}
		const { from, to } = keyer.sync(copy(fromSource), copy(toSource));
		return {
			from: atRow(layoutFrame(fromCode, raw(from)), union ? top : fromRow),
			to: atRow(layoutFrame(toCode, raw(to)), union ? top : toRow),
		};
	};

	const frames: MagicMovePlan["frames"] = windowed.map((code, i) => {
		const firstRow = rows[i] ?? 0;
		return {
			tokens: atRow(layoutFrame(code, raw(tokenize(code))), firstRow),
			lineCount: frameLineCount(code),
			...(firstRow > 0 ? { firstRow } : {}),
		};
	});

	const transitions: MagicMovePlan["transitions"] = [];
	for (let i = 0; i < windowed.length - 1; i++) {
		transitions.push(morph(i, i + 1));
	}

	const last = windowed.length - 1;
	const loopTransition = loop && windowed.length >= 2 ? morph(last, 0) : undefined;

	// The typewriter types the first step's window; its start indices are moved
	// to the full code's, which is the source the reveal counts characters in.
	const firstCode = windowed[0] ?? "";
	const firstStart = windows[0]?.start ?? 0;
	const typing = atRow(layoutTypingTokens(firstCode, raw(tokenize(firstCode))), rows[0] ?? 0);
	if (firstStart > 0) {
		for (const token of typing) {
			token.startChar += firstStart;
		}
	}

	return { frames, transitions, loopTransition, typing };
}
