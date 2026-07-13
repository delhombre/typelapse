import { type BundledTheme, bundledLanguages } from "shiki";

/**
 * Single source of truth mapping Typelapse theme names to Shiki bundled themes.
 * Shared by the highlighter adapter, the live preview and the magic-move engine
 * so the editor, preview and exported video always resolve identically.
 */
export const THEME_MAP: Record<string, BundledTheme> = {
	midnight: "github-dark",
	aurora: "aurora-x",
	frost: "github-light",
	dracula: "dracula",
	"one-dark": "one-dark-pro",
	catppuccin: "catppuccin-mocha",
	nord: "nord",
};

export const DEFAULT_SHIKI_THEME: BundledTheme = "github-dark";

export function resolveShikiTheme(themeName: string): BundledTheme {
	return THEME_MAP[themeName] ?? DEFAULT_SHIKI_THEME;
}

/** Resolve an editor language id to a loadable Shiki language, or `text` when unknown. */
export function resolveShikiLanguage(language: string): string {
	return language in bundledLanguages ? language : "text";
}
