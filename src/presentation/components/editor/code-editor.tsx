import type { Monaco, OnMount } from "@monaco-editor/react";
import { Suspense, lazy, useCallback, useEffect, useRef } from "react";

import {
	monacoLanguage,
	snippetDiagnostics,
} from "@/presentation/components/editor/monaco-language";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";

/**
 * The model's file name, by Monaco language. The TypeScript worker reads the
 * ScriptKind off the extension, and an extensionless in-memory model with
 * `allowJs` on is classified as a *JavaScript* file — at which point every type
 * annotation in a TypeScript snippet earns a red squiggle (ts 8010). `.tsx`
 * keeps annotations and JSX both legal; `.jsx` keeps the same honesty for
 * JavaScript, where an annotation genuinely is a mistake.
 */
const MONACO_PATHS: Record<string, string> = {
	typescript: "snippet.tsx",
	javascript: "snippet.jsx",
};

// Monaco comes from the app's bundle, not a CDN, and only once the editor is on
// screen: the import configures the loader before the first editor mounts.
const Editor = lazy(() => import("@/presentation/components/editor/monaco-runtime"));

const EDITOR_LOADING = (
	<div className="flex h-full items-center justify-center">
		<span className="font-mono text-[11px] text-neutral-400">Loading editor…</span>
	</div>
);

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

/** Hand the TypeScript and JavaScript workers the diagnostics this code earns. */
function applyDiagnostics(monaco: Monaco, code: string) {
	const diagnostics = snippetDiagnostics(code);
	for (const defaults of [
		monaco.languages.typescript.typescriptDefaults,
		monaco.languages.typescript.javascriptDefaults,
	]) {
		defaults.setDiagnosticsOptions({
			...diagnostics,
			diagnosticCodesToIgnore: [...diagnostics.diagnosticCodesToIgnore],
		});
	}
}

export function CodeEditor() {
	// Field by field: the whole store changes on every playback tick.
	const snippet = useSnippetStore((s) => s.snippet);
	// What the editor holds: its own emptiness while it is empty, which the snippet
	// cannot carry, else the snippet's code.
	const draft = useSnippetStore((s) => s.draft);
	const setCode = useSnippetStore((s) => s.setCode);
	const syncEditorTheme = useSnippetStore((s) => s.syncEditorTheme);
	const isDark = useThemeModeStore((s) => s.mode === "dark");
	const monacoRef = useRef<Monaco | null>(null);
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

	const editorTheme = syncEditorTheme
		? `typelapse-preview-${snippet.theme.name}`
		: isDark
			? "typelapse-dark"
			: "typelapse-light";

	const handleMount = useCallback<OnMount>((editor, monaco) => {
		monacoRef.current = monaco;
		editorRef.current = editor;

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
	}, []);

	// Before the editor exists, not on mount: the wrapper applies the `theme`
	// prop the moment it creates the editor, and a theme defined only afterwards
	// silently falls back to the stock light `vs` — which is how a dark studio
	// used to open on a white editor.
	const handleBeforeMount = useCallback((monaco: Monaco) => {
		// A snippet is a fragment, not a project (see SNIPPET_DIAGNOSTICS).
		const { draft: emptied, snippet: held } = useSnippetStore.getState();
		applyDiagnostics(monaco, emptied ?? held.code);
		for (const defaults of [
			monaco.languages.typescript.typescriptDefaults,
			monaco.languages.typescript.javascriptDefaults,
		]) {
			// Monaco has no separate TSX mode, so JSX has to be turned on here or a
			// React snippet is underlined as a syntax error for containing markup.
			defaults.setCompilerOptions({
				...defaults.getCompilerOptions(),
				jsx: monaco.languages.typescript.JsxEmit.React,
				allowJs: true,
				target: monaco.languages.typescript.ScriptTarget.ESNext,
			});
		}

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

	// The workers' options follow the code: a windowed import silences the syntax
	// squiggles its own separators cause, and typing the separator away brings
	// them back. Re-sent only when the answer changes, not on every keystroke.
	const code = draft ?? snippet.code;
	const diagnosticsKey = JSON.stringify(snippetDiagnostics(code));
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the whole answer; the code is only what it is read from.
	useEffect(() => {
		if (monacoRef.current) {
			applyDiagnostics(monacoRef.current, code);
		}
	}, [diagnosticsKey]);

	/** One producer for the model's identity: the prop and the sync read the same. */
	const editorLanguage = monacoLanguage(snippet.language);
	const editorPath = MONACO_PATHS[editorLanguage] ?? "snippet.txt";

	/**
	 * Put the store's code back into the model the language switch just handed us.
	 *
	 * `@monaco-editor/react` keeps one model per `path`, and the language picker
	 * changes the path. Switching away and back does not create a fresh buffer —
	 * it restores the cached one, with whatever it held when it was last on
	 * screen. The `value` prop is applied by an effect that depends on `value`,
	 * and `value` did not change on the render that swapped the path, so nothing
	 * pushed the current code into the restored model: TypeScript → edit → Python
	 * → back showed the code as it stood before the edit, while the store, the
	 * preview and the export all held the edit. Two sources of truth for the same
	 * buffer, and the visible one was the wrong one.
	 *
	 * Keyed on the path rather than on the code, because this is only ever about
	 * the moment a model is swapped in; `onChange` owns every keystroke after it.
	 * `setValue` is skipped when the two already agree, so an ordinary language
	 * change costs nothing and never disturbs the cursor.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the code is read, not depended on — reacting to it here would fight `onChange` on every keystroke.
	useEffect(() => {
		const model = editorRef.current?.getModel();
		if (!model) {
			return;
		}
		const { draft: emptied, snippet: held } = useSnippetStore.getState();
		const current = emptied ?? held.code;
		if (model.getValue() !== current) {
			model.setValue(current);
		}
	}, [editorPath]);

	const handleChange = useCallback(
		(value: string | undefined) => {
			if (value !== undefined) {
				setCode(value);
			}
		},
		[setCode],
	);

	// The editor and nothing around it. The project's name is the chip in the
	// scene's top-left corner and the language is the card's own header: a
	// second field bound to the same string is a question about which one is
	// real, and the answer was never interesting.
	return (
		<div className="flex h-full flex-col">
			{/* Monaco keeps Tab for indentation, which is correct — Tab in a code
			    editor indents code — and it means the keyboard cannot walk out of it
			    the ordinary way. Everything downstream in the DOM is the island: the
			    transport, the four clusters, the export. So there is a door, and it
			    is the first thing Tab reaches on the way in rather than something to
			    be discovered after being trapped. It is invisible until focused, so
			    it costs the pointer nothing. Monaco's own escape (⌃⇧M, or ⌥⇧M on
			    some layouts) is named on the region below for anyone already inside. */}
			<a href="#studio-island" className="sc-skip">
				Skip to playback controls
			</a>
			{/* Read in document order, just before the editor: `aria-description` is
			    still a draft attribute, and a paragraph here says the same thing to
			    every reader that exists today. */}
			<p className="sr-only">
				Code editor. Tab indents rather than moving focus. Press Control Shift M to make Tab move
				focus out, or use the “Skip to playback controls” link before this editor.
			</p>
			<div
				id="studio-editor"
				title="⌥Z: toggle word wrap"
				className="min-h-[220px] flex-1 overflow-hidden rounded-xl border border-neutral-200/70 lg:min-h-0 dark:border-neutral-800"
			>
				<Suspense fallback={EDITOR_LOADING}>
					<Editor
						value={draft ?? snippet.code}
						language={editorLanguage}
						path={editorPath}
						theme={editorTheme}
						onChange={handleChange}
						beforeMount={handleBeforeMount}
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
						loading={EDITOR_LOADING}
					/>
				</Suspense>
			</div>
		</div>
	);
}
