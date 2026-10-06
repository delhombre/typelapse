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

/**
 * What the TypeScript and JavaScript workers report in a snippet.
 *
 * A snippet is a fragment, not a project: it imports nothing, resolves nothing,
 * and is often mid-refactor by design, so semantic diagnostics would underline
 * almost every template in red for being exactly what it is. Syntax errors
 * still show, because those are the author's mistakes. One syntax error is not
 * one: "Invalid character" (1127) is what the `⋯` between the windows of a
 * pull request import reads as, and that separator is the studio's own mark,
 * not the author's.
 */
export const SNIPPET_DIAGNOSTICS = {
	noSemanticValidation: true,
	noSyntaxValidation: false,
	diagnosticCodesToIgnore: [1127],
} as const;
