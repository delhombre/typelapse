import { googleFontCssUrl } from "@/application/fonts/code-fonts";
import { Theme } from "@/domain/entities/theme";
import type { WindowChrome } from "@/presentation/components/preview/frame-chrome";

/**
 * The ladders every look-and-feel control climbs.
 *
 * They used to be private constants inside the settings strip, which was the
 * only thing that drew them. The strip is gone — the controls live in the
 * island's clusters now, on both the desktop scene and the phone — so the
 * ladders moved out ahead of it rather than being copied into their new home.
 */

export const THEMES = [
	{ name: "midnight", label: "Midnight", factory: () => Theme.midnight(), bg: "#0d1117" },
	{ name: "aurora", label: "Aurora", factory: () => Theme.aurora(), bg: "#1a1b2e" },
	{ name: "frost", label: "Frost", factory: () => Theme.frost(), bg: "#f0f4f8" },
	{ name: "dracula", label: "Dracula", factory: () => Theme.dracula(), bg: "#282a36" },
	{ name: "one-dark", label: "One Dark", factory: () => Theme.oneDark(), bg: "#282c34" },
	{ name: "catppuccin", label: "Catppuccin", factory: () => Theme.catppuccin(), bg: "#1e1e2e" },
	{ name: "nord", label: "Nord", factory: () => Theme.nord(), bg: "#2e3440" },
] as const;

export const RADIUS_PRESETS = [0, 4, 8, 12, 16, 24] as const;

/** Shared by the code's padding and the mesh margin around it, on purpose. */
export const PADDING_PRESETS = [16, 24, 32, 48, 64] as const;

export const CHROME_PRESETS: { value: WindowChrome; label: string; title: string }[] = [
	{ value: "macos", label: "macOS", title: "macOS traffic lights" },
	{ value: "browser", label: "Web", title: "Browser address bar" },
	{ value: "terminal", label: "Term", title: "Terminal prompt" },
	{ value: "none", label: "None", title: "No window chrome" },
];

export const TEMPO_PRESETS = [
	{ ms: 400, label: "Snappy", title: "Snappy: 400 ms morph" },
	{ ms: 650, label: "Smooth", title: "Smooth: 650 ms morph" },
	{ ms: 1000, label: "Cine", title: "Cinematic: 1000 ms morph" },
] as const;

export const PROGRESS_STYLES = ["reels", "bar", "none"] as const;

const loadedFonts = new Set<string>();

/**
 * The picker's own copy of a font, as a `<link>`. The render worker fetches the
 * very same stylesheet by URL, from the very same registry, because a font the
 * panel can show and the renderer cannot is how an export ends up in a typeface
 * nobody chose.
 */
export function loadGoogleFont(googleName: string): void {
	if (loadedFonts.has(googleName)) {
		return;
	}
	loadedFonts.add(googleName);
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = googleFontCssUrl(googleName);
	document.head.appendChild(link);
}
