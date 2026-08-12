/**
 * Shiki ids the editor spells differently.
 *
 * The snippet's language is a Shiki id, because Shiki renders the artefact
 * being sold: the video. Monaco is only the writing surface, and its language
 * list is neither the same set nor the same names.
 */
const MONACO_ALIASES: Record<string, string> = {
	// Monaco's TypeScript/JavaScript modes parse JSX already: they simply have no
	// separate id for the React dialects.
	tsx: "typescript",
	jsx: "javascript",
	// No diff grammar ships with Monaco. Plain text is the honest fallback; the
	// preview still shows real diff colours, through Shiki.
	diff: "plaintext",
};

/** The Monaco language id to edit a Shiki-highlighted snippet in. */
export function monacoLanguage(shikiLanguage: string): string {
	return MONACO_ALIASES[shikiLanguage] ?? shikiLanguage;
}
