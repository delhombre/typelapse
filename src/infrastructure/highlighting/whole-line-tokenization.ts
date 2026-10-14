/**
 * The longest line, in columns, Shiki still tokenizes (#331). Shiki counts UTF-16
 * code units (`line.length`), not display cells, so a line of wide glyphs is cut
 * at fewer cells than this. A card shows at most
 * `VISIBLE_COL_LIMIT` (648) columns and a frame is designed for 72, so a line
 * past this is data, not code (a minified bundle, a base64 blob). 2,000 columns
 * is three times what any canvas can show. A line just under it still tokenizes in
 * about 25 ms; one at or past it comes back from Shiki as one token in 0.1 ms,
 * where a 200,000-column line took 10 s (22 s in #328's measure), frozen on the
 * studio's main thread. The trade-off, accepted: the visible 648 columns of a line
 * over the cap lose their highlighting and draw in the theme foreground (the plan
 * walk in `application/magic-move/plan.ts` turns Shiki's empty colour into no
 * colour).
 */
export const MAX_TOKENIZED_LINE_COLUMNS = 2_000;

/**
 * The Shiki options every tokenization behind a frame passes: the studio's keyer,
 * the server's (`server/remotion/magic-move-plan.ts`) and the static poster.
 *
 * Shiki gives up on a line after `tokenizeTimeLimit` ms of wall clock (500 by
 * default) and hands back the rest of it as one token, without saying so. On a
 * loaded machine a 72-column line, which tokenizes in a third of a millisecond,
 * can still be descheduled past the limit: `greet(name: string) {` then arrives as
 * one token, the keyer caches it, and the hosted render's plan stops matching the
 * device's (#315). Zero turns the check off (vscode-textmate skips it at 0), so
 * the tokens are a function of the code alone, and since Shiki never reports a
 * line it cut short, it is the only setting under which a tokenization is known
 * whole. What the clock used to bound, a very long line, is bounded by length
 * instead, which is as deterministic as the code: `tokenizeMaxLineLength` (#331).
 */
export const WHOLE_LINE_TOKENIZATION = {
	tokenizeTimeLimit: 0,
	tokenizeMaxLineLength: MAX_TOKENIZED_LINE_COLUMNS,
} as const;

/**
 * The most characters, summed over the two codes of a pair, that may have no
 * counterpart in the other for `syncTokenKeys` to run (#337): the lines of each
 * middle (the codes minus their common head and tail) that the other middle does
 * not hold, plus the margin the lines gain or lose. The diff's cost follows what
 * it has to search, not the length of the codes nor the distance between two edits.
 *
 * diff-match-patch cannot be told to stop earlier: its one-second timeout is a
 * default, and shiki-magic-move calls it with no options. Its cost on lines it
 * cannot match is steeply superlinear in the middle, whatever the width of the
 * lines. Unrelated text sums to 2,000 characters in 9 to 22 ms, 6,000 in 52 to
 * 77 ms, 8,000 in 100 to 157 ms, 16,000 in 372 to 532 ms, and about 20,000 and up
 * in the full second. 6,000 keeps the worst pair under 80 ms. It sits twice above
 * the widest rewrite a page is built for (24 rows of 72 columns, fully unrelated:
 * about 3,000) and ten times above the largest morph of the hono fixture and the
 * six templates (about 600).
 */
export const MAX_SYNCED_EDIT_CHARACTERS = 6_000;

/**
 * The most characters, summed over the two middles, a pair may hold at all (#337),
 * whatever matches. Lines in another order are all matched, so they add nothing to
 * the count above, yet the diff still has to place them: 100 lines of 300 columns
 * reversed (60,000 characters) sync in 62 ms, 203 lines of 600 columns in 742 ms,
 * 100 of 1,500 in 3.8 s, 203 of 1,999 in 9.9 s. A 203-row window of 72 columns is
 * about 30,000 for both sides, half of this. A block only one side holds is exempt.
 */
export const MAX_SYNCED_PAIR_CHARACTERS = 60_000;

type Tokenization = { code: string; tokens: readonly { content: string }[] };

/**
 * What differs between two codes, in characters (#337). The diff trims their common
 * head and tail first, but two edits far apart leave everything between them in the
 * middle, shared or not, so the middle measures the distance between edits. What
 * the diff has to search is the text with no counterpart on the other side: the
 * lines of each middle that the other middle does not hold (a multiset of lines,
 * so a line held twice is matched twice). Lines are compared without their
 * leading whitespace: a reindent, or code wrapped in a block, is the same lines
 * under another margin. Reordered lines are all matched; an edited line counts on
 * both sides.
 *
 * The margin is not free, though: the diff still pays for every space a reindent
 * adds or removes (80 spaces off 100 lines cost 461 ms, 120 off 203 lines more than
 * a second). So the change in the sum of the lines' leading whitespace is counted
 * as unmatched, which a 2-space reindent of 100 lines hardly moves (200).
 *
 * `removed` and `added` are the characters of each middle's lines, newlines
 * excluded; `unmatched` is those of the lines left over on both sides, margins
 * excluded, plus the margin change. O(n) in the codes.
 */
function difference(
	from: string,
	to: string,
): { removed: number; added: number; unmatched: number } {
	const shortest = Math.min(from.length, to.length);
	let head = 0;
	while (head < shortest && from[head] === to[head]) {
		head++;
	}
	let tail = 0;
	while (tail < shortest - head && from[from.length - 1 - tail] === to[to.length - 1 - tail]) {
		tail++;
	}
	const middle = (code: string) => code.slice(head, code.length - tail).split("\n");
	const removed = middle(from);
	const added = middle(to);
	const characters = (lines: string[]) => lines.reduce((sum, text) => sum + text.length, 0);
	const margin = (lines: string[]) =>
		lines.reduce((sum, text) => sum + (text.length - text.trimStart().length), 0);
	const held = new Map<string, number>();
	for (const text of added) {
		const key = text.trimStart();
		held.set(key, (held.get(key) ?? 0) + 1);
	}
	let unmatched = Math.abs(margin(removed) - margin(added));
	for (const text of removed) {
		const key = text.trimStart();
		const count = held.get(key) ?? 0;
		if (count > 0) {
			held.set(key, count - 1);
		} else {
			unmatched += key.length;
		}
	}
	for (const [text, count] of held) {
		unmatched += text.length * count;
	}
	return { removed: characters(removed), added: characters(added), unmatched };
}

/**
 * Whether the keys of two tokenizations are worth syncing (#335, #337).
 * `syncTokenKeys` diffs the two codes through diff-match-patch, which stops after a
 * second of wall clock: on text it cannot match, a morph costs that whole second, on
 * every plan rebuild. A diff cut by the clock is not a function of the code either.
 * A pair that would reach it is planned as a scene break (#307) instead: nothing is
 * matched, every old token fades out and every new one fades in. Two bounds, both
 * pure in the two tokenizations, so the studio and the server decide alike:
 *
 * - Capped lines (tokens of `MAX_TOKENIZED_LINE_COLUMNS` or more, the only way a
 *   token gets that long) that differ. The same capped lines on both sides, in the
 *   same order, are not a reason: the diff trims what they share and matches them in
 *   tens of milliseconds, so an edit next to a pasted minified line, or a scroll
 *   past it, still glides.
 * - More than `MAX_SYNCED_EDIT_CHARACTERS` of text with no counterpart (#337):
 *   large pairs of lines under the cap, a pasted table or log across two steps.
 *   The length of the codes does not count, nor the distance between two edits:
 *   only the lines of each side that the other lacks, once the common head and
 *   tail go, and the margin they gain or lose. An edit in a long page, two edits
 *   at its ends, lines reordered, a small reindent and code wrapped in a block
 *   still glide.
 * - More than `MAX_SYNCED_PAIR_CHARACTERS` in the two middles together, matched or
 *   not: the diff still has to place a page's lines when they come in another
 *   order.
 *
 * A block only one side holds (a paste appended, a section removed) is a reason
 * for neither: the diff has nothing to search.
 */
export function canSyncKeys<T extends Tokenization>(from: T, to: T): boolean {
	const cappedLines = (source: Tokenization) =>
		source.tokens
			.filter((token) => token.content.length >= MAX_TOKENIZED_LINE_COLUMNS)
			.map((token) => token.content);
	const before = cappedLines(from);
	const after = cappedLines(to);
	const sameCapped =
		before.length === after.length && before.every((content, i) => content === after[i]);
	if (!sameCapped) {
		return false;
	}
	const { removed, added, unmatched } = difference(from.code, to.code);
	// A pure insertion or deletion leaves the diff nothing to search: 90,000
	// characters with a block appended sync in 12 ms.
	if (removed === 0 || added === 0) {
		return true;
	}
	return removed + added <= MAX_SYNCED_PAIR_CHARACTERS && unmatched <= MAX_SYNCED_EDIT_CHARACTERS;
}
