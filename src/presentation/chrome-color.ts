/**
 * The paper each side paints under the browser's own chrome: what `theme-color`
 * says to the status bar and the URL bar. One source for the two stores that
 * rewrite it (the landing's and the studio's) so a forced side never drifts from
 * the other; `tests/presentation/chrome-color.test.ts` pins it to app.css's
 * `--color-paper` and to index.html's two metas, which answer System.
 */
export const CHROME_COLOR = { light: "#faf9f6", dark: "#121110" } as const;
