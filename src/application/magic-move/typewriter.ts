/**
 * Typewriter reveal: pure. Types a frame's code out character by character,
 * slicing the token being typed and reporting the cursor position. This is the
 * literal "Typelapse" promise (watch the code get written) and something
 * snipcast doesn't do. Shared by the preview and the Remotion video.
 */
import {
	type GridPosition,
	type RawToken,
	type RenderToken,
	type TypedToken,
	gridPositions,
} from "./engine";

export type { TypedToken };

export interface TypingView {
	tokens: RenderToken[];
	cursor: GridPosition | null;
}

/** Lay tokens out for typing: keeps whitespace and records each token's start index. */
export function layoutTypingTokens(code: string, tokens: RawToken[], tabSize = 2): TypedToken[] {
	const positions = gridPositions(code, tabSize);
	return tokens.map((token) => {
		const index = Math.min(Math.max(token.offset, 0), positions.length - 1);
		const pos = positions[index] ?? { line: 0, col: 0 };
		return {
			key: token.key,
			content: token.content,
			line: pos.line,
			col: pos.col,
			color: token.color,
			fontStyle: token.fontStyle,
			startChar: token.offset,
		};
	});
}

/**
 * Progress through the first hold by which the reveal has finished typing (it
 * then holds the full frame). Exported so the tick-sound synth can invert the
 * same pacing and align key ticks with the visible characters.
 */
export const TYPE_COMPLETE_AT = 0.85;

/** How many characters are revealed at playback progress `p` (finishes a bit early, then holds). */
export function typedCharCount(
	codeLength: number,
	p: number,
	completeAt = TYPE_COMPLETE_AT,
): number {
	const ratio = completeAt <= 0 ? 1 : Math.min(1, Math.max(0, p) / completeAt);
	return Math.ceil(ratio * codeLength);
}

/** Reveal the first `revealChars` characters, slicing the straddling token, plus the cursor. */
export function renderTyping(
	code: string,
	tokens: TypedToken[],
	revealChars: number,
	tabSize = 2,
): TypingView {
	const reveal = Math.max(0, revealChars);
	const out: RenderToken[] = [];

	for (const token of tokens) {
		if (token.startChar >= reveal) {
			continue;
		}
		const end = token.startChar + token.content.length;
		const content =
			end <= reveal ? token.content : token.content.slice(0, reveal - token.startChar);
		if (content.length === 0) {
			continue;
		}
		out.push({
			key: token.key,
			content,
			line: token.line,
			col: token.col,
			opacity: 1,
			color: token.color,
			fontStyle: token.fontStyle,
		});
	}

	const positions = gridPositions(code, tabSize);
	const index = Math.min(Math.max(Math.round(reveal), 0), positions.length - 1);
	return { tokens: out, cursor: positions[index] ?? null };
}
