import { ensureReadableTokenColor } from "@/application/accessibility/token-contrast";

/**
 * The code editor's themes, derived from the studio's warm tokens.
 *
 * Monaco takes hex strings, not custom properties, so the tokens it needs are
 * mirrored here and `tests/application/monaco-theme.test.ts` reads the CSS to
 * fail when one drifts. The editor used to be the one cold surface in a warm
 * studio: a #0a0a0a page, neutral greys, line numbers at 1.8:1 and Monaco's
 * stock bracket colours (DECISIONS D9, 2026-10-08 audit).
 *
 * Pure and dependency-free like the rest of `application/`: the editor component
 * hands the result to `monaco.editor.defineTheme`.
 */

export type EditorBase = "vs" | "vs-dark";

export interface EditorThemeData {
	readonly base: EditorBase;
	readonly colors: Readonly<Record<string, string>>;
}

interface Palette {
	/** `--camera-paper`: the desktop paper, which the editor sits on. */
	readonly paper: string;
	/** `--camera-surface`: widgets and menus, opaque. */
	readonly surface: string;
	/** `--camera-ink`. */
	readonly ink: string;
	/** `--camera-muted`. */
	readonly muted: string;
	/** The 1px line, as an opaque colour (the scene hairline over the paper). */
	readonly line: string;
	/** `--color-accent`, for the selection. */
	readonly accent: string;
	/** Bracket levels, before they are pulled to 4.5:1. Warm in the dark, deep in the light. */
	readonly brackets: readonly string[];
}

export const STUDIO_EDITOR_PALETTES: Readonly<Record<"light" | "dark", Palette>> = {
	light: {
		paper: "#fafaf9",
		surface: "#ffffff",
		ink: "#1c1917",
		muted: "#6e6b64",
		line: "#e7e5e4",
		accent: "#567bf7",
		brackets: ["#9a5a00", "#2a6f4c", "#4f46b5", "#a1432e", "#1f6a8a", "#7b4a8f"],
	},
	dark: {
		paper: "#121110",
		surface: "#1e1c1a",
		ink: "#f5f3ef",
		muted: "#a8a39a",
		line: "#2e2b28",
		accent: "#567bf7",
		brackets: ["#f1be01", "#8fb4ff", "#d9a3ea", "#f09a7e", "#7fd1b0", "#e6c28a"],
	},
};

const MIN_TEXT_CONTRAST = 4.5;

/** The studio's own light or dark editor, for the app theme. */
export function studioEditorTheme(mode: "light" | "dark"): EditorThemeData {
	const palette = STUDIO_EDITOR_PALETTES[mode];
	return {
		base: mode === "dark" ? "vs-dark" : "vs",
		colors: {
			"editor.background": palette.paper,
			"editor.foreground": palette.ink,
			"editor.lineHighlightBackground": `${palette.paper}00`,
			"editor.lineHighlightBorder": "#00000000",
			"editor.selectionBackground": `${palette.accent}40`,
			"editor.inactiveSelectionBackground": `${palette.accent}22`,
			"editorCursor.foreground": palette.ink,
			...lineNumbers(palette.paper, palette.muted, palette.ink),
			...brackets(palette.paper, palette.brackets),
			"editorIndentGuide.background1": palette.line,
			"editorIndentGuide.activeBackground1": palette.muted,
			"editorWidget.background": palette.surface,
			"editorWidget.border": palette.line,
			"editorSuggestWidget.background": palette.surface,
			"editorSuggestWidget.border": palette.line,
			"editorHoverWidget.background": palette.surface,
			"editorHoverWidget.border": palette.line,
			"scrollbarSlider.background": `${palette.muted}33`,
			"scrollbarSlider.hoverBackground": `${palette.muted}55`,
			"scrollbarSlider.activeBackground": `${palette.muted}77`,
		},
	};
}

/**
 * The editor mirroring one of the video's syntax themes. Its colours are the
 * theme's own (that is the point of mirroring it); what is ours is that its
 * line numbers and brackets are still readable on its background.
 */
export function previewEditorTheme(input: {
	base: EditorBase;
	bg: string;
	fg: string;
}): EditorThemeData {
	const dark = input.base === "vs-dark";
	const palette = STUDIO_EDITOR_PALETTES[dark ? "dark" : "light"];
	return {
		base: input.base,
		colors: {
			"editor.background": input.bg,
			"editor.foreground": input.fg,
			"editor.lineHighlightBackground": `${input.bg}00`,
			"editor.lineHighlightBorder": "#00000000",
			...lineNumbers(input.bg, mixHex(input.fg, input.bg, 0.45), input.fg),
			...brackets(input.bg, palette.brackets),
		},
	};
}

/** A resting number and the active line's, both pulled to 4.5:1 on the background. */
function lineNumbers(background: string, resting: string, active: string): Record<string, string> {
	return {
		"editorLineNumber.foreground": ensureReadableTokenColor(resting, background, MIN_TEXT_CONTRAST),
		"editorLineNumber.activeForeground": ensureReadableTokenColor(
			active,
			background,
			MIN_TEXT_CONTRAST,
		),
	};
}

function brackets(background: string, levels: readonly string[]): Record<string, string> {
	const colors: Record<string, string> = {};
	levels.forEach((level, index) => {
		colors[`editorBracketHighlight.foreground${index + 1}`] = ensureReadableTokenColor(
			level,
			background,
			MIN_TEXT_CONTRAST,
		);
	});
	colors["editorBracketHighlight.unexpectedBracket.foreground"] = ensureReadableTokenColor(
		"#d6453d",
		background,
		MIN_TEXT_CONTRAST,
	);
	return colors;
}

/** `from` mixed toward `to` by `amount` (0 is `from`), in sRGB, as a 6-digit hex. */
function mixHex(from: string, to: string, amount: number): string {
	const channel = (hex: string, offset: number) =>
		Number.parseInt(hex.slice(offset, offset + 2), 16);
	const mixed = [1, 3, 5].map((offset) =>
		Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount)
			.toString(16)
			.padStart(2, "0"),
	);
	return `#${mixed.join("")}`;
}
