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

import type { FontFaceSource } from "./font-face-css";

export interface CodeFont {
	/** The picker's own short label. */
	label: string;
	/** The family name a theme's stack names first. */
	family: string;
	/** The whole stack a theme stores. */
	stack: string;
	/** The files this app ships itself, under `public/fonts`. */
	files: readonly FontFile[];
	/** The weights a scope holds, when not the code fonts' three. */
	weights?: string;
}

/**
 * One file the app serves for a family. A variable file with no `weight` of its
 * own is registered once per weight of the family, as Google registered it; a
 * `unicodeRange` makes the scope fetch the file only when a character needs it.
 */
export interface FontFile {
	url: string;
	weight?: string;
	unicodeRange?: string;
}

/** The code fonts' three weights: 400 for code, 500 and 700 for what a theme marks bold. */
const CODE_WEIGHTS = "400;500;700";

// Google's own subset files, copied byte for byte (OFL, licences beside them).
const JETBRAINS_MONO_FILES: readonly FontFile[] = [
	{
		url: "/fonts/JetBrainsMono-cyrillic-ext.woff2",
		unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
	},
	{
		url: "/fonts/JetBrainsMono-cyrillic.woff2",
		unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
	},
	{
		url: "/fonts/JetBrainsMono-greek.woff2",
		unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
	},
	{
		url: "/fonts/JetBrainsMono-vietnamese.woff2",
		unicodeRange:
			"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
	},
	{
		url: "/fonts/JetBrainsMono-latin-ext.woff2",
		unicodeRange:
			"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
	},
	{
		url: "/fonts/JetBrainsMono-latin.woff2",
		unicodeRange:
			"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
	},
];

const GEIST_FILES: readonly FontFile[] = [
	{
		url: "/fonts/Geist-cyrillic-ext.woff2",
		unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
	},
	{
		url: "/fonts/Geist-cyrillic.woff2",
		unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
	},
	{
		url: "/fonts/Geist-vietnamese.woff2",
		unicodeRange:
			"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
	},
	{
		url: "/fonts/Geist-latin-ext.woff2",
		unicodeRange:
			"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
	},
	{
		url: "/fonts/Geist-latin.woff2",
		unicodeRange:
			"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
	},
];

/**
 * The subset ranges every later family is cut at: the ones Google serves
 * JetBrains Mono and Geist at (above), with the blocks that are one file here
 * merged (Cyrillic with its extension, Latin extended with Vietnamese, Greek
 * with its extension). `scripts/subset-fonts.py` cuts the upstream releases at
 * exactly these. Listed from the one that matters least to the one that
 * matters most: where ranges overlap the later rule wins, so Latin is last.
 */
export const SUBSET_RANGES = {
	cyrillic:
		"U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116, U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
	greek: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF, U+1F00-1FFF",
	symbols: "U+2000-2001, U+2004-2008, U+200A, U+23B8-23BD, U+2500-259F",
	"latin-ext":
		"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF, U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
	latin:
		"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
} as const;

type Subset = keyof typeof SUBSET_RANGES;

/** `<prefix>-<subset>.woff2` for each subset, in the order given. */
function subsetFiles(prefix: string, subsets: readonly Subset[]): readonly FontFile[] {
	return subsets.map((subset) => ({
		url: `/fonts/${prefix}-${subset}.woff2`,
		unicodeRange: SUBSET_RANGES[subset],
	}));
}

const TEXT_SUBSETS = ["cyrillic", "greek", "latin-ext", "latin"] as const;
const CODE_SUBSETS = ["cyrillic", "greek", "symbols", "latin-ext", "latin"] as const;

const JETBRAINS: CodeFont = {
	label: "JetBrains",
	family: "JetBrains Mono",
	stack: "JetBrains Mono, monospace",
	files: JETBRAINS_MONO_FILES,
};

/** The families the picker offers, in the order it offers them. */
export const FONT_PRESETS: readonly CodeFont[] = [
	JETBRAINS,
	{
		label: "Fira",
		family: "Fira Code",
		stack: "Fira Code, monospace",
		files: subsetFiles("FiraCode", CODE_SUBSETS),
	},
	{
		label: "Source",
		family: "Source Code Pro",
		stack: "Source Code Pro, monospace",
		files: subsetFiles("SourceCodePro", TEXT_SUBSETS),
	},
	{
		label: "IBM",
		family: "IBM Plex Mono",
		stack: "IBM Plex Mono, monospace",
		files: subsetFiles("IBMPlexMono", TEXT_SUBSETS),
	},
	{
		label: "Cascadia",
		family: "Cascadia Code",
		stack: "Cascadia Code, monospace",
		files: subsetFiles("CascadiaCode", CODE_SUBSETS),
	},
];

/**
 * Every family the app knows how to fetch, which is three more than it offers: a
 * theme can carry the app's own self-hosted mono even though no picker sets it,
 * a text layer is set in Geist, the app's sans, which the render worker has
 * to load as surely as any code font, and a step caption is set in Inter.
 */
export const LOADABLE_FONTS: readonly CodeFont[] = [
	...FONT_PRESETS,
	{
		label: "Ioskeley",
		family: "Ioskeley Mono",
		stack: "Ioskeley Mono, monospace",
		files: [
			{ url: "/fonts/IoskeleyMono-Regular.woff2", weight: "400" },
			{ url: "/fonts/IoskeleyMono-SemiBold.woff2", weight: "600" },
		],
	},
	{
		label: "Geist",
		family: "Geist",
		stack: "Geist, ui-sans-serif, system-ui, sans-serif",
		files: GEIST_FILES,
		// The weights the UI is set in, so a text layer's weight resolves to the
		// same face in the worker and the server as in the document.
		weights: "400;500;600;700",
	},
	{
		label: "Inter",
		family: "Inter",
		stack: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
		files: subsetFiles("Inter", TEXT_SUBSETS),
		// The weights a caption is set in (the file's axis stops at 600).
		weights: "400;500;600",
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
 * The faces a family registers, in the one shape the document, the render
 * worker and the server composition all read.
 */
export function selfHostedFaces(font: CodeFont): FontFaceSource[] {
	const weights = (font.weights ?? CODE_WEIGHTS).split(";");
	return font.files.flatMap((file) =>
		(file.weight ? [file.weight] : weights).map((weight) => ({
			family: font.family,
			url: file.url,
			weight,
			style: "normal",
			unicodeRange: file.unicodeRange,
		})),
	);
}
