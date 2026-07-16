/**
 * Single source of truth mapping a filename / path extension to a Shiki language
 * id. Shared by URL import (`import/code-url`) and diff import (`diff/`) so an
 * inferred language renders identically in the editor, preview and Magic Move
 * engine instead of falling back to plain text.
 *
 * The map is the union of every extension either feature recognises, and every
 * target is a real Shiki bundled id (verified against `bundledLanguages`), so an
 * inferred id always loads a grammar. `tsx`/`jsx`/`c` keep their precise grammars
 * rather than collapsing into `typescript`/`javascript`/`cpp`.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "tsx",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "jsx",
	py: "python",
	rs: "rust",
	go: "go",
	html: "html",
	htm: "html",
	css: "css",
	json: "json",
	jsonc: "json",
	java: "java",
	cs: "csharp",
	cpp: "cpp",
	cc: "cpp",
	cxx: "cpp",
	hpp: "cpp",
	hh: "cpp",
	c: "c",
	h: "c",
	php: "php",
	rb: "ruby",
	swift: "swift",
	kt: "kotlin",
	kts: "kotlin",
	sql: "sql",
	yaml: "yaml",
	yml: "yaml",
	md: "markdown",
	markdown: "markdown",
	sh: "bash",
	bash: "bash",
};

const DEFAULT_LANGUAGE = "typescript";

/** The last path segment, lowercased (empty when the input is empty). */
function basename(name: string): string {
	return name.split("/").pop()?.toLowerCase() ?? "";
}

/**
 * Infer a file's Shiki language id from its name or path, or `undefined` when the
 * extension is unrecognised. Accepts a bare name or a full path; `null` /
 * `undefined` in → `undefined` out. A `Dockerfile` (no extension) is special-cased.
 *
 * Callers that must land on *some* grammar use {@link languageFromFilename}; the
 * diff importer keeps `undefined` so it can preserve the current language.
 */
export function languageFromPath(path: string | null | undefined): string | undefined {
	if (!path) {
		return undefined;
	}
	const base = basename(path);
	if (base === "dockerfile") {
		return "dockerfile";
	}
	const dot = base.lastIndexOf(".");
	if (dot <= 0) {
		return undefined;
	}
	const ext = base.slice(dot + 1);
	return EXTENSION_TO_LANGUAGE[ext];
}

/**
 * Like {@link languageFromPath} but always yields a language: unknown or
 * extensionless names fall back to TypeScript. Used by URL import, where the
 * studio must open the snippet in *some* grammar.
 */
export function languageFromFilename(name: string): string {
	return languageFromPath(name) ?? DEFAULT_LANGUAGE;
}

/** True when the path points at a file we can language-tag (used to accept a raw code URL). */
export function hasCodeExtension(path: string): boolean {
	return languageFromPath(path) !== undefined;
}
