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

type Tokenization = { tokens: readonly { content: string }[] };

/**
 * Whether the keys of two tokenizations are worth syncing (#335). `syncTokenKeys`
 * diffs the two codes through diff-match-patch, which stops after a second of wall
 * clock: on lines it cannot match, 200,000 columns or 20,000 alike, a morph costs
 * that whole second, on every plan rebuild. A capped line (one token at or past
 * `MAX_TOKENIZED_LINE_COLUMNS`, the only way a token gets that long) is data
 * the diff has nothing to say about, and a diff cut by the clock is not a function
 * of the code either, so a pair holding one is planned as a scene break (#307):
 * nothing is matched, every old token fades out and every new one fades in.
 */
export function canSyncKeys<T extends Tokenization>(from: T, to: T): boolean {
	const capped = (source: Tokenization) =>
		source.tokens.some((token) => token.content.length >= MAX_TOKENIZED_LINE_COLUMNS);
	return !capped(from) && !capped(to);
}
