import { create } from "zustand";

type ThemeMode = "light" | "dark";

/** Read by the inline script in index.html too, so a reload opens on the same side. */
const STORAGE_KEY = "typelapse.studio-theme";

/** The studio ramp's two ends (app.css paints the document with the same pair). */
const CHROME_COLOR: Record<ThemeMode, string> = { light: "#fafaf9", dark: "#121110" };

function storedMode(): ThemeMode | null {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : null;
	} catch {
		return null;
	}
}

function initialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "light";
	}
	const stored = storedMode();
	if (stored) {
		return stored;
	}
	return typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/**
 * Paints the studio in a theme: the `.dark` class every studio colour keys off,
 * and `theme-color`, because index.html can only answer the OS and a studio
 * switched to the other side otherwise sat under the wrong status bar.
 */
export function applyStudioTheme(mode: ThemeMode): void {
	document.documentElement.classList.toggle("dark", mode === "dark");
	for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		tag.content = CHROME_COLOR[mode];
	}
}

function choose(mode: ThemeMode): void {
	applyStudioTheme(mode);
	try {
		window.localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// Private mode or a full quota: the choice still holds for this visit.
	}
}

interface ThemeModeState {
	mode: ThemeMode;
	toggle: () => void;
	setMode: (mode: ThemeMode) => void;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
	mode: initialMode(),

	toggle: () => {
		set((state) => {
			const next = state.mode === "dark" ? "light" : "dark";
			choose(next);
			return { mode: next };
		});
	},

	setMode: (mode: ThemeMode) => {
		choose(mode);
		set({ mode });
	},
}));
