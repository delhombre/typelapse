import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import {
	type BundledLanguage,
	type BundledTheme,
	type Highlighter,
	bundledLanguagesInfo,
	createHighlighter,
} from "shiki";

const THEME_MAP: Record<string, BundledTheme> = {
	midnight: "github-dark",
	aurora: "aurora-x",
	frost: "github-light",
	dracula: "dracula",
	"one-dark": "one-dark-pro",
	catppuccin: "catppuccin-mocha",
	nord: "nord",
};

const DEFAULT_THEME: BundledTheme = "github-dark";

export class ShikiAdapter implements HighlighterPort {
	private highlighter: Highlighter | null = null;
	private initPromise: Promise<Highlighter> | null = null;

	/** Expose raw Shiki instance for shiki-magic-move */
	async getRawHighlighter(): Promise<Highlighter> {
		return this.getHighlighter();
	}

	private async getHighlighter(): Promise<Highlighter> {
		if (this.highlighter) {
			return this.highlighter;
		}
		if (!this.initPromise) {
			this.initPromise = createHighlighter({
				themes: Object.values(THEME_MAP),
				langs: ["typescript", "javascript", "python", "rust", "go", "html", "css", "json"],
			}).then((h) => {
				this.highlighter = h;
				return h;
			});
		}
		return this.initPromise;
	}

	async highlight(code: string, language: string, theme: string): Promise<string> {
		const highlighter = await this.getHighlighter();
		const shikiTheme = THEME_MAP[theme] ?? DEFAULT_THEME;

		const loadedLangs = highlighter.getLoadedLanguages();
		let lang: BundledLanguage | "text" = "text";
		if (loadedLangs.includes(language as BundledLanguage)) {
			lang = language as BundledLanguage;
		}

		return highlighter.codeToHtml(code, {
			lang,
			theme: shikiTheme,
		});
	}

	getSupportedLanguages(): string[] {
		return bundledLanguagesInfo.map((l) => l.id);
	}
}
