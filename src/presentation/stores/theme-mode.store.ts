import { create } from "zustand";

type ThemeMode = "light" | "dark";

interface ThemeModeState {
	mode: ThemeMode;
	toggle: () => void;
	setMode: (mode: ThemeMode) => void;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
	mode:
		typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light",

	toggle: () => {
		set((state) => {
			const next = state.mode === "dark" ? "light" : "dark";
			document.documentElement.classList.toggle("dark", next === "dark");
			return { mode: next };
		});
	},

	setMode: (mode: ThemeMode) => {
		document.documentElement.classList.toggle("dark", mode === "dark");
		set({ mode });
	},
}));
