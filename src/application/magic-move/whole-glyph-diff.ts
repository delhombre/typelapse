/**
 * Diff edges on glyph edges: pure.
 *
 * The keyers sync token keys from a character diff (shiki-magic-move runs
 * diff-match-patch), and with `splitTokens` they cut tokens wherever an equal
 * stretch starts or ends. That diff counts UTF-16 code units: `🚀` and `😀`
 * share their high surrogate, so it reports "equal `\ud83d`, then changed", the
 * token is cut between the two halves and every renderer draws half an emoji.
 * An accent changed on the same letter, or one member of a joined emoji
 * sequence, is cut the same way.
 *
 * This cleanup, handed to the diff as `diffCleanup`, shrinks each equal stretch
 * until both of its ends are glyph edges in both codes; what it gives up joins
 * the neighbouring edit on both sides (deleted and inserted), so the two codes
 * the diff spells never change. The client and the server keyers pass it alike,
 * so they keep cutting tokens on the same boundaries.
 */

import { clusters } from "../text/display-width";

/** A diff-match-patch edit: -1 deleted from the first code, 1 inserted, 0 equal. */
export type TextEdit = [-1 | 0 | 1, string];

/** UTF-16 indices where a glyph starts, plus the end of the text. */
function glyphEdges(text: string): Set<number> {
	const edges = new Set<number>([text.length]);
	for (const cluster of clusters(text)) {
		edges.add(cluster.start);
	}
	return edges;
}

export function keepGlyphsWhole(diffs: TextEdit[]): TextEdit[] {
	let from = "";
	let to = "";
	for (const [op, text] of diffs) {
		if (op !== 1) {
			from += text;
		}
		if (op !== -1) {
			to += text;
		}
	}
	const fromEdges = glyphEdges(from);
	const toEdges = glyphEdges(to);
	const isEdge = (a: number, b: number) => fromEdges.has(a) && toEdges.has(b);

	const out: TextEdit[] = [];
	let deleted = "";
	let inserted = "";
	const flush = () => {
		if (deleted !== "") {
			out.push([-1, deleted]);
		}
		if (inserted !== "") {
			out.push([1, inserted]);
		}
		deleted = "";
		inserted = "";
	};

	let a = 0;
	let b = 0;
	for (const [op, text] of diffs) {
		if (op === -1) {
			deleted += text;
			a += text.length;
			continue;
		}
		if (op === 1) {
			inserted += text;
			b += text.length;
			continue;
		}
		let head = 0;
		while (head < text.length && !isEdge(a + head, b + head)) {
			head++;
		}
		let tail = text.length;
		while (tail > head && !isEdge(a + tail, b + tail)) {
			tail--;
		}
		// What the equal stretch gives up is the same text on both sides.
		deleted += text.slice(0, head);
		inserted += text.slice(0, head);
		if (tail > head) {
			flush();
			out.push([0, text.slice(head, tail)]);
		}
		deleted += text.slice(tail);
		inserted += text.slice(tail);
		a += text.length;
		b += text.length;
	}
	flush();
	return out;
}
