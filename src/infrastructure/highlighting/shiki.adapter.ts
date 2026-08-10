import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import {
	type BundledLanguage,
	type Highlighter,
	bundledLanguages,
	bundledLanguagesInfo,
	createHighlighter,
} from "shiki";
import { THEME_MAP, resolveShikiLanguage, resolveShikiTheme } from "./shiki-registry";

/** Languages loaded eagerly on boot: the rest are fetched on demand. */
const INITIAL_LANGS: BundledLanguage[] = ["typescript", "javascript", "python", "json"];

export class ShikiAdapter implements HighlighterPort {
	private highlighter: Highlighter | null = null;
	private initPromise: Promise<Highlighter> | null = null;
	private readonly loading = new Map<string, Promise<void>>();

	/** Expose raw Shiki instance for shiki-magic-move */
	async getRawHighlighter(): Promise<Highlighter> {
		return this.getHighlighter();
	}

	/**
	 * Load a language and hand back the id Shiki will accept.
	 *
	 * Callers that go through `highlight` get this for free. Callers that take the
	 * raw highlighter and tokenize themselves — the magic-move keyer, and every
	 * component built on it — do not, and `codeToTokens` throws for any language
	 * outside INITIAL_LANGS. It throws quietly, inside a promise whose rejection
	 * those callers swallow, so the symptom is a frame that simply never appears.
	 * Awaiting this first is what makes a language other than the four preloaded
	 * ones usable from the raw path.
	 */
	async loadLanguage(language: string): Promise<string> {
		const highlighter = await this.getHighlighter();
		return this.ensureLanguage(highlighter, language);
	}

	private async getHighlighter(): Promise<Highlighter> {
		if (this.highlighter) {
			return this.highlighter;
		}
		if (!this.initPromise) {
			this.initPromise = createHighlighter({
				themes: Object.values(THEME_MAP),
				langs: INITIAL_LANGS,
			}).then((h) => {
				this.highlighter = h;
				return h;
			});
		}
		return this.initPromise;
	}

	/** Lazily load a bundled language so every option in the picker works. */
	private async ensureLanguage(highlighter: Highlighter, language: string): Promise<string> {
		const lang = resolveShikiLanguage(language);
		if (lang === "text" || highlighter.getLoadedLanguages().includes(lang)) {
			return lang;
		}
		let pending = this.loading.get(lang);
		if (!pending) {
			pending = highlighter.loadLanguage(lang as BundledLanguage).then(() => undefined);
			this.loading.set(lang, pending);
		}
		await pending;
		return lang;
	}

	async highlight(code: string, language: string, theme: string): Promise<string> {
		const highlighter = await this.getHighlighter();
		const shikiTheme = resolveShikiTheme(theme);
		const lang = await this.ensureLanguage(highlighter, language);

		return highlighter.codeToHtml(code, {
			lang,
			theme: shikiTheme,
		});
	}

	getSupportedLanguages(): string[] {
		return bundledLanguagesInfo
			.map((l) => l.id)
			.filter((id): id is BundledLanguage => id in bundledLanguages);
	}
}
