export interface HighlighterPort {
	highlight(code: string, language: string, theme: string): Promise<string>;
	getSupportedLanguages(): string[];
}
