/**
 * Typewriter reveal: pure. Types a frame's code out character by character,
 * slicing the token being typed and reporting the cursor position. This is the
 * literal "Typelapse" promise: you watch the code get written rather than watch
 * it appear. Shared by the preview and the Remotion video.
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

/**
 * The hold the typewriter types over: the first scene with code. A video that
 * opens on a title card (a blank scene) draws no card there, so typing over it
 * typed nothing anyone could see. 0 when no scene has code.
 */
export function typingHoldIndex(sceneCodes: readonly string[]): number {
	return Math.max(
		0,
		sceneCodes.findIndex((code) => code !== ""),
	);
}

/**
 * How far the reveal has typed at a playback position, 0..1, or null once the
 * morph takes over. Every segment before the typed hold is an empty window, so
 * the card fades in on nothing and is then typed, never shown whole first.
 * One rule for the preview, the painter and the server's card.
 */
export function typingProgressAt(
	position: { phase: "hold" | "transition" | "loop"; index: number; t: number },
	holdIndex: number,
): number | null {
	if (position.phase === "loop") {
		return null;
	}
	if (position.index < holdIndex) {
		return 0;
	}
	return position.phase === "hold" && position.index === holdIndex ? position.t : null;
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
