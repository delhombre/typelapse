import type { CodeBlockPayload, TextBlockPayload } from "../project/project-document";

const DEFAULT_CODE_THEME = {
	background: "#0d1117",
	foreground: "#e6edf3",
} as const;

const CODE_THEMES: Readonly<
	Record<string, { readonly background: string; readonly foreground: string }>
> = {
	midnight: DEFAULT_CODE_THEME,
	aurora: { background: "#1a1b2e", foreground: "#d4d4e4" },
	frost: { background: "#f0f4f8", foreground: "#1a202c" },
	dracula: { background: "#282a36", foreground: "#f8f8f2" },
	"one-dark": { background: "#282c34", foreground: "#abb2bf" },
	catppuccin: { background: "#1e1e2e", foreground: "#cdd6f4" },
	nord: { background: "#2e3440", foreground: "#d8dee9" },
};

const CODE_BOX_SHADOW = "0 24px 64px rgb(0 0 0 / 0.22), 0 2px 10px rgb(0 0 0 / 0.16)";

export interface CodeLayerVisual {
	readonly themeName: string;
	readonly background: string;
	readonly foreground: string;
	readonly chrome: CodeBlockPayload["chrome"];
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly lineHeight: number;
	readonly borderRadius: number;
	readonly framePadding: number;
	readonly boxShadow: string;
	readonly lineNumberColor: string;
	readonly lineNumberGap: number;
}

export interface TextLayerVisual {
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly fontWeight: number;
	readonly color: string;
	readonly textAlign: TextBlockPayload["typography"]["align"];
	readonly justifyContent: "flex-start" | "center" | "flex-end";
	readonly lineHeight: number;
	readonly letterSpacing: string;
}

function textJustification(
	align: TextBlockPayload["typography"]["align"],
): TextLayerVisual["justifyContent"] {
	if (align === "left") {
		return "flex-start";
	}
	if (align === "right") {
		return "flex-end";
	}
	return "center";
}

/**
 * Canonical code-card projection consumed by the DOM preview and Remotion.
 * It deliberately contains values rather than CSS objects so the application
 * layer remains framework-free and parity can be asserted without screenshots.
 */
export function projectCodeLayerVisual(
	block: Pick<
		CodeBlockPayload,
		"themeName" | "chrome" | "fontFamily" | "borderRadius" | "framePadding"
	>,
): CodeLayerVisual {
	const theme = CODE_THEMES[block.themeName] ?? DEFAULT_CODE_THEME;
	return {
		themeName: block.themeName,
		background: theme.background,
		foreground: theme.foreground,
		chrome: block.chrome,
		fontFamily: block.fontFamily ?? "Ioskeley Mono, ui-monospace, monospace",
		fontSize: 18,
		lineHeight: 1.55,
		borderRadius: block.borderRadius ?? 12,
		framePadding: block.framePadding,
		boxShadow: CODE_BOX_SHADOW,
		lineNumberColor: `${theme.foreground}40`,
		lineNumberGap: 18,
	};
}

/** Canonical typography projection shared by every V2 visual renderer. */
export function projectTextLayerVisual(
	block: Pick<TextBlockPayload, "typography">,
): TextLayerVisual {
	return {
		fontFamily: block.typography.fontFamily,
		fontSize: block.typography.fontSize,
		fontWeight: block.typography.fontWeight,
		color: block.typography.color,
		textAlign: block.typography.align,
		justifyContent: textJustification(block.typography.align),
		lineHeight: 1.08,
		letterSpacing: "-0.035em",
	};
}
