import { create } from "zustand";

/** The side the studio is painted on. */
export type ThemeMode = "light" | "dark";
/** What the visitor asked for: a side, or the system's (design audit 2026-10-08, D6). */
export type ThemePreference = ThemeMode | "system";

/**
 * A forced side, read by the inline script in index.html too, so a reload opens
 * on it. System is no stored value: the OS answers.
 */
const STORAGE_KEY = "typelapse.studio-appearance";
/**
 * Where the old two-state toggle kept its side. One tap on it pinned a side
 * forever, so most of what it holds is an accident, not a choice: it is read
 * as System once, and removed.
 */
const LEGACY_KEY = "typelapse.studio-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The studio ramp's two ends (app.css paints the document with the same pair). */
const CHROME_COLOR: Record<ThemeMode, string> = { light: "#fafaf9", dark: "#121110" };

function systemMode(): ThemeMode {
	return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
		? "dark"
		: "light";
}

function storedPreference(): ThemePreference {
	try {
		window.localStorage.removeItem(LEGACY_KEY);
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : "system";
	} catch {
		return "system";
	}
}

function resolve(preference: ThemePreference): ThemeMode {
	return preference === "system" ? systemMode() : preference;
}

/**
 * Paints the studio: the `.dark` class every studio colour keys off, and, for a
 * forced side only, `theme-color`. index.html's two metas answer the OS through
 * their media queries, which is exactly System; a forced side rewrites both,
 * since the OS no longer says which side the studio is on, and System puts
 * index.html's values back.
 */
export function applyStudioTheme(mode: ThemeMode, preference: ThemePreference): void {
	const root = document.documentElement;
	if (root.classList.contains("dark") !== (mode === "dark")) {
		withoutTransitions(() => root.classList.toggle("dark", mode === "dark"));
	}
	for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		tag.dataset.systemContent ??= tag.content;
		tag.content = preference === "system" ? tag.dataset.systemContent : CHROME_COLOR[mode];
	}
}

/**
 * A side changes in one frame: every control's own colour transition would
 * otherwise run at once, at its own speed, and the switch would ripple across
 * the studio (a System switch at sunset included).
 */
function withoutTransitions(change: () => void): void {
	const freeze = document.createElement("style");
	freeze.textContent = "*,*::before,*::after{transition:none!important}";
	document.head.append(freeze);
	change();
	// Read a style so the new side is painted before transitions come back.
	void getComputedStyle(document.documentElement).color;
	const thaw = () => freeze.remove();
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(thaw);
	} else {
		setTimeout(thaw, 0);
	}
}

function store(preference: ThemePreference): void {
	try {
		if (preference === "system") {
			window.localStorage.removeItem(STORAGE_KEY);
		} else {
			window.localStorage.setItem(STORAGE_KEY, preference);
		}
	} catch {
		// Private mode or a full quota: the choice still holds for this visit.
	}
}

/** The desktop's one button steps through the three, in this order. */
export const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
	system: "light",
	light: "dark",
	dark: "system",
};

interface ThemeModeState {
	/** What the visitor chose. */
	preference: ThemePreference;
	/** The side that choice paints, the OS's under System. */
	mode: ThemeMode;
	setPreference: (preference: ThemePreference) => void;
	cycle: () => void;
}

const initialPreference: ThemePreference =
	typeof window === "undefined" ? "system" : storedPreference();

export const useThemeModeStore = create<ThemeModeState>((set, get) => ({
	preference: initialPreference,
	mode: typeof window === "undefined" ? "light" : resolve(initialPreference),

	setPreference: (preference) => {
		const mode = resolve(preference);
		applyStudioTheme(mode, preference);
		store(preference);
		set({ preference, mode });
	},

	cycle: () => get().setPreference(NEXT_PREFERENCE[get().preference]),
}));

/** Paints the studio as the store says, for the route that mounts it. */
export function paintStudioTheme(): void {
	const { mode, preference } = useThemeModeStore.getState();
	applyStudioTheme(mode, preference);
}

/**
 * Paints the studio and, under System, follows the OS while the studio is
 * mounted: a phone that turns dark at sunset turns the studio with it. Returns
 * the way out, for the route's cleanup: once the studio has gone the landing
 * paints the document, and an OS switch must not flip `.dark` or write the
 * studio's status bar under it (review of #245). A change that arrives while
 * the landing's theme attribute is on the document is the landing's, too.
 */
export function followStudioTheme(): () => void {
	// Back from the landing, under System the OS may have changed while the studio
	// was away: answer it as it is now, not as the studio left it.
	const { preference } = useThemeModeStore.getState();
	if (preference === "system") {
		useThemeModeStore.setState({ mode: resolve(preference) });
	}
	paintStudioTheme();
	if (typeof window.matchMedia !== "function") {
		return () => undefined;
	}
	const query = window.matchMedia(DARK_QUERY);
	const follow = (event: { matches: boolean }) => {
		const { preference } = useThemeModeStore.getState();
		if (preference !== "system" || document.documentElement.dataset.landingTheme) {
			return;
		}
		const mode: ThemeMode = event.matches ? "dark" : "light";
		applyStudioTheme(mode, preference);
		useThemeModeStore.setState({ mode });
	};
	query.addEventListener("change", follow);
	return () => query.removeEventListener("change", follow);
}
