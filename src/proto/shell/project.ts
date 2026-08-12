/**
 * The one project every direction is showing.
 *
 * A shape study only answers its question if the content is held fixed: three
 * steps, the Solar mesh, the Midnight theme, step 2 of 3 selected, 04.2s in.
 * If A looked richer than B because A was given a longer snippet, the picker
 * would be comparing snippets.
 *
 * Throwaway: dies with src/proto/shell.
 */

export const PROJECT_TITLE = "use-toast.ts";

export const PROJECT_BACKGROUND = "solar";

export const PROJECT_THEME = "midnight";

/** The frame the preview is holding: the second of the three steps. */
export const PROJECT_CODE = `export function useToast() {
  const [items, setItems] = useState<Toast[]>([]);

  const push = (message: string) => {
    setItems((prev) => [...prev, { id: uid(), message }]);
  };

  return { items, push };
}`;

export interface ProtoStep {
	readonly index: number;
	readonly preview: string;
	readonly seconds: string;
	readonly annotation: string;
}

export const PROJECT_STEPS: ProtoStep[] = [
	{ index: 1, preview: "export function useToast() {", seconds: "1.2s", annotation: "the hook" },
	{ index: 2, preview: "const push = (message: string)", seconds: "1.2s", annotation: "push one" },
	{
		index: 3,
		preview: "useEffect(() => { … }, [items])",
		seconds: "1.5s",
		annotation: "auto-dismiss",
	},
];

/** The selected step, zero-based. */
export const CURRENT_STEP = 1;

/** The seven theme swatches, as they read in the settings strip today. */
export const THEME_SWATCHES = [
	{ name: "midnight", label: "Midnight", bg: "#0d1117" },
	{ name: "aurora", label: "Aurora", bg: "#1a1b2e" },
	{ name: "frost", label: "Frost", bg: "#f0f4f8" },
	{ name: "dracula", label: "Dracula", bg: "#282a36" },
	{ name: "one-dark", label: "One Dark", bg: "#282c34" },
	{ name: "catppuccin", label: "Catppuccin", bg: "#1e1e2e" },
	{ name: "nord", label: "Nord", bg: "#2e3440" },
] as const;

/** The six mesh backgrounds, quoted as two-stop gradients for the swatch grid. */
export const BACKGROUND_SWATCHES = [
	{ id: "solar", label: "Solar", css: "linear-gradient(135deg,#f7c948,#e8833a)" },
	{ id: "aurora", label: "Aurora", css: "linear-gradient(135deg,#7c5cff,#33d6c1)" },
	{ id: "nebula", label: "Nebula", css: "linear-gradient(135deg,#b14bff,#2b2f7a)" },
	{ id: "ocean", label: "Ocean", css: "linear-gradient(135deg,#2f9bff,#0b3d91)" },
	{ id: "ember", label: "Ember", css: "linear-gradient(135deg,#ff6b4a,#7a1f3d)" },
	{ id: "forest", label: "Forest", css: "linear-gradient(135deg,#4fbf7a,#0f4d3a)" },
] as const;
