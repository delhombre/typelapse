/**
 * The Shiki option every tokenization behind a frame passes: the studio's keyer,
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
 * whole. A line a frame is built for needs no limit (72 columns: 0.34 ms); a
 * minified line of 100,000 columns now takes about 9 s where the limit cut it at
 * 500 ms. The deterministic bound for that is a per-line length cap (#331).
 */
export const WHOLE_LINE_TOKENIZATION = { tokenizeTimeLimit: 0 } as const;
