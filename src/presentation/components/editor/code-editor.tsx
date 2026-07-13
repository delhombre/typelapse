import Editor, { type Monaco } from "@monaco-editor/react";
import { useCallback, useRef } from "react";

import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";

const LANGUAGES = [
	{ value: "typescript", label: "TypeScript" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "python", label: "Python" },
	{ value: "rust", label: "Rust" },
	{ value: "go", label: "Go" },
	{ value: "html", label: "HTML" },
	{ value: "css", label: "CSS" },
	{ value: "json", label: "JSON" },
	{ value: "java", label: "Java" },
	{ value: "csharp", label: "C#" },
	{ value: "cpp", label: "C++" },
	{ value: "php", label: "PHP" },
	{ value: "ruby", label: "Ruby" },
	{ value: "swift", label: "Swift" },
	{ value: "kotlin", label: "Kotlin" },
	{ value: "sql", label: "SQL" },
	{ value: "yaml", label: "YAML" },
	{ value: "markdown", label: "Markdown" },
	{ value: "shell", label: "Shell" },
	{ value: "dockerfile", label: "Dockerfile" },
];

// Monaco theme that mirrors the preview snippet theme
const PREVIEW_THEME_MAP: Record<string, { base: "vs" | "vs-dark"; bg: string; fg: string }> = {
	midnight: { base: "vs-dark", bg: "#0d1117", fg: "#e6edf3" },
	aurora: { base: "vs-dark", bg: "#1a1b2e", fg: "#d4d4e4" },
	frost: { base: "vs", bg: "#f0f4f8", fg: "#1a202c" },
	dracula: { base: "vs-dark", bg: "#282a36", fg: "#f8f8f2" },
	"one-dark": { base: "vs-dark", bg: "#282c34", fg: "#abb2bf" },
	catppuccin: { base: "vs-dark", bg: "#1e1e2e", fg: "#cdd6f4" },
	nord: { base: "vs-dark", bg: "#2e3440", fg: "#d8dee9" },
};

export function CodeEditor() {
	const { snippet, setCode, setLanguage, setTitle, syncEditorTheme } = useSnippetStore();
	const isDark = useThemeModeStore((s) => s.mode === "dark");
	const monacoRef = useRef<Monaco | null>(null);

	const editorTheme = syncEditorTheme
		? `typelapse-preview-${snippet.theme.name}`
		: isDark
			? "typelapse-dark"
			: "typelapse-light";

	const handleMount = useCallback((_: unknown, monaco: Monaco) => {
		monacoRef.current = monaco;

		// App-level themes (follow light/dark mode)
		monaco.editor.defineTheme("typelapse-dark", {
			base: "vs-dark",
			inherit: true,
			rules: [],
			colors: {
				"editor.background": "#0a0a0a",
				"editor.foreground": "#e5e5e5",
				"editor.lineHighlightBackground": "#17171700",
				"editor.selectionBackground": "#26264080",
				"editorCursor.foreground": "#a3a3a3",
				"editorLineNumber.foreground": "#404040",
				"editorLineNumber.activeForeground": "#737373",
				"editorWidget.background": "#171717",
				"editorWidget.border": "#262626",
				"editor.lineHighlightBorder": "#00000000",
			},
		});

		monaco.editor.defineTheme("typelapse-light", {
			base: "vs",
			inherit: true,
			rules: [],
			colors: {
				"editor.background": "#fafafa",
				"editor.foreground": "#171717",
				"editor.lineHighlightBackground": "#f5f5f500",
				"editor.selectionBackground": "#d4d4d480",
				"editorCursor.foreground": "#525252",
				"editorLineNumber.foreground": "#d4d4d4",
				"editorLineNumber.activeForeground": "#a3a3a3",
				"editorWidget.background": "#fafafa",
				"editorWidget.border": "#e5e5e5",
				"editor.lineHighlightBorder": "#00000000",
			},
		});

		// Preview-mirroring themes
		for (const [name, cfg] of Object.entries(PREVIEW_THEME_MAP)) {
			monaco.editor.defineTheme(`typelapse-preview-${name}`, {
				base: cfg.base,
				inherit: true,
				rules: [],
				colors: {
					"editor.background": cfg.bg,
					"editor.foreground": cfg.fg,
					"editor.lineHighlightBackground": `${cfg.bg}00`,
					"editor.lineHighlightBorder": "#00000000",
					"editorLineNumber.foreground": cfg.base === "vs-dark" ? "#404040" : "#c0c0c0",
					"editorLineNumber.activeForeground": cfg.base === "vs-dark" ? "#737373" : "#a3a3a3",
				},
			});
		}
	}, []);

	const handleChange = useCallback(
		(value: string | undefined) => {
			if (value !== undefined) {
				setCode(value);
			}
		},
		[setCode],
	);

	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex items-center gap-3">
				<input
					type="text"
					value={snippet.title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Snippet title…"
					className="h-8 flex-1 border border-neutral-200 bg-transparent px-3 font-mono text-xs text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
				/>
				<select
					value={snippet.language}
					onChange={(e) => setLanguage(e.target.value)}
					className="h-8 border border-neutral-200 bg-transparent px-2 font-mono text-[10px] uppercase tracking-wider text-neutral-600 outline-none transition-colors focus:border-neutral-400 dark:border-neutral-800 dark:text-neutral-400 dark:focus:border-neutral-500"
				>
					{LANGUAGES.map((lang) => (
						<option key={lang.value} value={lang.value}>
							{lang.label}
						</option>
					))}
				</select>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden border border-neutral-200 dark:border-neutral-800">
				<Editor
					value={snippet.code}
					language={snippet.language}
					theme={editorTheme}
					onChange={handleChange}
					onMount={handleMount}
					options={{
						minimap: { enabled: false },
						fontSize: 13,
						fontFamily: "'JetBrains Mono', ui-monospace, monospace",
						fontLigatures: true,
						lineNumbers: "on",
						lineNumbersMinChars: 3,
						renderLineHighlight: "none",
						scrollBeyondLastLine: false,
						padding: { top: 12, bottom: 12 },
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						overviewRulerBorder: false,
						scrollbar: {
							vertical: "auto",
							horizontal: "auto",
							verticalScrollbarSize: 6,
							horizontalScrollbarSize: 6,
						},
						wordWrap: "on",
						tabSize: 2,
						autoIndent: "full",
						formatOnPaste: true,
						formatOnType: true,
						suggestOnTriggerCharacters: true,
						quickSuggestions: true,
						bracketPairColorization: { enabled: true },
						autoClosingBrackets: "always",
						autoClosingQuotes: "always",
						guides: { indentation: true, bracketPairs: true },
						smoothScrolling: true,
						cursorBlinking: "smooth",
						cursorSmoothCaretAnimation: "on",
						contextmenu: true,
						folding: true,
						matchBrackets: "always",
					}}
					loading={
						<div className="flex h-full items-center justify-center">
							<span className="font-mono text-[10px] text-neutral-400">Loading editor…</span>
						</div>
					}
				/>
			</div>
		</div>
	);
}
