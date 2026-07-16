import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
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

	const handleMount = useCallback<OnMount>((editor, monaco) => {
		monacoRef.current = monaco;

		// VS Code parity: word wrap is off by default (horizontal scroll), and ⌥Z
		// toggles it: same keybinding VS Code uses. Also surfaces in the command
		// palette (F1 → "Toggle word wrap") for discoverability.
		editor.addAction({
			id: "toggle-word-wrap",
			label: "Toggle word wrap",
			keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
			run: (ed) => {
				const wrapped = ed.getOption(monaco.editor.EditorOption.wordWrap) !== "off";
				ed.updateOptions({ wordWrap: wrapped ? "off" : "on" });
			},
		});

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
			<div className="flex items-center gap-2">
				<input
					type="text"
					value={snippet.title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Untitled snippet"
					className="h-9 flex-1 rounded-xl border border-neutral-200/70 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-300 focus:ring-2 focus:ring-neutral-900/5 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-700 dark:focus:ring-white/5"
				/>
				<select
					value={snippet.language}
					onChange={(e) => setLanguage(e.target.value)}
					className="h-9 rounded-xl border border-neutral-200/70 bg-white px-2.5 text-xs font-medium text-neutral-600 outline-none transition focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-700"
				>
					{LANGUAGES.map((lang) => (
						<option key={lang.value} value={lang.value}>
							{lang.label}
						</option>
					))}
				</select>
			</div>
			<div
				title="⌥Z: toggle word wrap"
				className="min-h-[260px] flex-1 overflow-hidden rounded-xl border border-neutral-200/70 lg:min-h-0 dark:border-neutral-800"
			>
				<Editor
					value={snippet.code}
					language={snippet.language}
					theme={editorTheme}
					onChange={handleChange}
					onMount={handleMount}
					options={{
						fixedOverflowWidgets: true,
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
						wordWrap: "off",
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
