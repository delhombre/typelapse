/**
 * The families a code frame can be set in, and where each one comes from.
 *
 * This used to be a `const` inside the settings panel, which was fine while the
 * only thing that needed it was a row of buttons. It is not fine once a *worker*
 * has to paint the same text: a worker has no document, therefore no
 * `@font-face` rules and no `<link>` the panel injected, so it resolves whatever
 * the operating system happens to have and silently paints the wrong typeface.
 *
 * So the registry moves down here, where the picker, the render worker and the
 * still painter can all read it, and every entry says where its file is.
 */

export interface CodeFont {
	/** The picker's own short label. */
	label: string;
	/** The family name a theme's stack names first. */
	family: string;
	/** The whole stack a theme stores. */
	stack: string;
	/** Google Fonts family token, when that is where the app fetches it from. */
	google?: string;
	/** A file this app ships itself. */
	url?: string;
}

const JETBRAINS: CodeFont = {
	label: "JetBrains",
	family: "JetBrains Mono",
	stack: "JetBrains Mono, monospace",
	google: "JetBrains+Mono",
};

/** The families the picker offers, in the order it offers them. */
export const FONT_PRESETS: readonly CodeFont[] = [
	JETBRAINS,
	{ label: "Fira", family: "Fira Code", stack: "Fira Code, monospace", google: "Fira+Code" },
	{
		label: "Source",
		family: "Source Code Pro",
		stack: "Source Code Pro, monospace",
		google: "Source+Code+Pro",
	},
	{
		label: "IBM",
		family: "IBM Plex Mono",
		stack: "IBM Plex Mono, monospace",
		google: "IBM+Plex+Mono",
	},
	{
		label: "Cascadia",
		family: "Cascadia Code",
		stack: "Cascadia Code, monospace",
		google: "Cascadia+Code",
	},
];

/**
 * Every family the app knows how to fetch, which is one more than it offers: a
 * theme can carry the app's own self-hosted mono even though no picker sets it.
 */
export const LOADABLE_FONTS: readonly CodeFont[] = [
	...FONT_PRESETS,
	{
		label: "Ioskeley",
		family: "Ioskeley Mono",
		stack: "Ioskeley Mono, monospace",
		url: "/fonts/IoskeleyMono-Regular.woff2",
	},
];

const BY_FAMILY = new Map(LOADABLE_FONTS.map((font) => [font.family.toLowerCase(), font]));

/** The first family in a CSS stack, with any quotes taken off. */
export function primaryFamily(stack: string): string {
	return familyNames(stack)[0] ?? "";
}

/** Every family name in a CSS stack, unquoted. */
export function familyNames(stack: string): string[] {
	return stack
		.split(",")
		.map((part) => part.trim().replace(/^["']|["']$/g, ""))
		.filter((part) => part !== "");
}

/**
 * The fonts that have to be loaded before these stacks can be painted.
 *
 * A family the registry does not know is not a failure: it is a generic
 * (`monospace`) or a system face (`Menlo`), and every scope resolves those the
 * same way with nothing fetched. Only the families the app itself supplies can
 * go missing, and those are exactly the ones listed here.
 */
export function fontsToLoad(...stacks: string[]): CodeFont[] {
	const found = new Map<string, CodeFont>();
	for (const stack of stacks) {
		for (const name of familyNames(stack)) {
			const font = BY_FAMILY.get(name.toLowerCase());
			if (font && !found.has(font.family)) {
				found.set(font.family, font);
			}
		}
	}
	return [...found.values()];
}

/**
 * The stylesheet URL for a Google family.
 *
 * The same three weights the settings panel injects and the Remotion
 * composition fetches, so all three surfaces get the same file: 400 for code,
 * 500 and 700 for whatever a theme marks bold.
 */
export function googleFontCssUrl(google: string): string {
	return `https://fonts.googleapis.com/css2?family=${google}:wght@400;500;700&display=swap`;
}
