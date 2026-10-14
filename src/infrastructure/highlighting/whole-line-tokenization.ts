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
 * The most characters, summed over the two codes of a pair, that may differ between
 * them for `syncTokenKeys` to run (#337). The diff trims what the codes share at
 * both ends first, so its cost follows the middle that is left, not the length of
 * the codes. diff-match-patch cannot be told to stop earlier (its one-second timeout
 * is a default, and shiki-magic-move calls it with no options), and its cost on
 * lines it cannot match is steeply superlinear in the middle, whatever the width of
 * the lines: unrelated text sums to 2,000 characters in 9 to 22 ms, 6,000 in 52 to
 * 77 ms, 8,000 in 100 to 157 ms, 16,000 in 372 to 532 ms and about 20,000 and up in
 * the full second. 6,000 keeps the worst pair under 80 ms and sits twice above the
 * widest rewrite a page is built for (24 rows of 72 columns, fully unrelated:
 * about 3,000) and ten times above the largest morph of the hono fixture and the
 * six templates (about 600).
 */
export const MAX_SYNCED_EDIT_CHARACTERS = 6_000;

type Tokenization = { code: string; tokens: readonly { content: string }[] };

/** The characters of each code left once their common head and tail are trimmed. */
function differingMiddles(from: string, to: string): [number, number] {
	const shortest = Math.min(from.length, to.length);
	let head = 0;
	while (head < shortest && from[head] === to[head]) {
		head++;
	}
	let tail = 0;
	while (tail < shortest - head && from[from.length - 1 - tail] === to[to.length - 1 - tail]) {
		tail++;
	}
	return [from.length - head - tail, to.length - head - tail];
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
 * - A differing middle past `MAX_SYNCED_EDIT_CHARACTERS` (#337): large pairs of
 *   lines under the cap, a pasted table or log across two steps. The length of the
 *   codes does not count, only what is left once their common head and tail go, so
 *   an edit in a long page still glides, and neither does a block only one side
 *   holds, a paste appended or a section removed.
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
	const [removed, added] = differingMiddles(from.code, to.code);
	// A pure insertion or deletion leaves the diff nothing to search: 90,000
	// characters with a block appended sync in 12 ms.
	return removed === 0 || added === 0 || removed + added <= MAX_SYNCED_EDIT_CHARACTERS;
}
