/**
 * The longest line, in columns, Shiki still tokenizes (#331). A card shows at most
 * `VISIBLE_COL_LIMIT` (648) columns and a frame is designed for 72, so a line
 * past this is data, not code (a minified bundle, a base64 blob): tokenizing it
 * is a cost with nothing to show for it. 2,000 columns is three times what any
 * canvas can show, and tokenizes in about 25 ms where a 200,000-column line took
 * 10 s, frozen on the studio's main thread. A line at or past it comes back from
 * Shiki as one token, in the theme foreground (the plan walk in
 * `application/magic-move/plan.ts` turns Shiki's empty colour into no colour).
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
