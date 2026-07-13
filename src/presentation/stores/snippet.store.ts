import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";
import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { resolveShikiLanguage } from "@/infrastructure/highlighting/shiki-registry";
import type { Highlighter } from "shiki";
import { create } from "zustand";

/** Where playback currently sits: holding on a step, or morphing between two. */
export interface PlaybackState {
	phase: "hold" | "transition";
	index: number;
	t: number;
}

interface SnippetState {
	snippet: Snippet;

	/** Laid-out magic-move frames + transitions for the current steps (or live code). */
	plan: MagicMovePlan | null;
	isBuilding: boolean;

	// Playback
	currentStepIndex: number;
	isPlaying: boolean;
	isPreparing: boolean;
	playbackProgress: number;
	playback: PlaybackState | null;

	// Background
	background: string;
	setBackground: (bg: string) => void;

	// Frame padding
	framePadding: number;
	setFramePadding: (padding: number) => void;

	// Watermark
	watermark: string;
	setWatermark: (text: string) => void;

	// Editor ↔ Preview theme sync
	syncEditorTheme: boolean;
	setSyncEditorTheme: (sync: boolean) => void;

	setCode: (code: string) => void;
	setLanguage: (language: string) => void;
	setTitle: (title: string) => void;
	setTheme: (theme: Theme) => void;
	setFont: (fontFamily: string) => void;
	setBorderRadius: (borderRadius: number) => void;

	/** Re-tokenize the effective codes and rebuild the magic-move plan. */
	rebuildPlan: () => Promise<void>;

	// Step management
	captureStep: (duration?: number) => void;
	removeStep: (stepId: string) => void;
	updateStepDuration: (stepId: string, duration: number) => void;
	reorderSteps: (orderedIds: string[]) => void;

	// Playback
	setCurrentStepIndex: (index: number) => void;
	play: () => void;
	pause: () => void;

	// Import/Export
	exportToJson: () => string;
	importFromJson: (json: string) => void;
}

let rawShikiHighlighter: Highlighter | null = null;
let rafId: number | null = null;

export function setHighlighter(highlighter: HighlighterPort) {
	if ("getRawHighlighter" in highlighter) {
		(highlighter as { getRawHighlighter: () => Promise<Highlighter> })
			.getRawHighlighter()
			.then((h) => {
				rawShikiHighlighter = h;
				return useSnippetStore.getState().rebuildPlan();
			})
			.catch(() => undefined);
	}
}

const DEFAULT_CODE = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Typelapse"));`;

function rebuildSnippet(
	snippet: Snippet,
	overrides: Partial<{ title: string; code: string; language: string; theme: Theme }>,
): Snippet {
	let updated = Snippet.create({
		title: overrides.title ?? snippet.title,
		code: overrides.code ?? snippet.code,
		language: overrides.language ?? snippet.language,
		theme: overrides.theme ?? snippet.theme,
		renderConfig: snippet.renderConfig,
	});
	for (const step of snippet.steps) {
		updated = updated.addStep(step);
	}
	return updated;
}

function cancelRaf() {
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
}

/** The codes the plan animates over: the captured steps, or the live code. */
function effectiveCodes(snippet: Snippet): string[] {
	return snippet.steps.length > 0 ? snippet.steps.map((s) => s.code) : [snippet.code];
}

async function ensureLanguageLoaded(language: string): Promise<void> {
	const highlighter = rawShikiHighlighter;
	if (!highlighter) {
		return;
	}
	const lang = resolveShikiLanguage(language);
	if (lang !== "text" && !highlighter.getLoadedLanguages().includes(lang)) {
		await highlighter.loadLanguage(lang as Parameters<Highlighter["loadLanguage"]>[0]);
	}
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
	snippet: Snippet.create({
		title: "Untitled",
		code: DEFAULT_CODE,
		language: "typescript",
	}),
	plan: null,
	isBuilding: true,
	currentStepIndex: 0,
	isPlaying: false,
	isPreparing: false,
	playbackProgress: 0,
	playback: null,
	background: "mesh:aurora",

	framePadding: 24,

	setFramePadding: (padding: number) => {
		set({ framePadding: padding });
	},

	watermark: "",

	setWatermark: (text: string) => {
		set({ watermark: text });
	},

	syncEditorTheme: false,

	setSyncEditorTheme: (sync: boolean) => {
		set({ syncEditorTheme: sync });
	},

	setBackground: (bg: string) => {
		set({ background: bg });
	},

	setCode: (code: string) => {
		set({ snippet: rebuildSnippet(get().snippet, { code }) });
		get().rebuildPlan();
	},

	setLanguage: (language: string) => {
		set({ snippet: rebuildSnippet(get().snippet, { language }) });
		get().rebuildPlan();
	},

	setTitle: (title: string) => {
		set({ snippet: rebuildSnippet(get().snippet, { title }) });
	},

	setTheme: (theme: Theme) => {
		set({ snippet: rebuildSnippet(get().snippet, { theme }) });
		get().rebuildPlan();
	},

	setFont: (fontFamily: string) => {
		const newTheme = Theme.create({ ...get().snippet.theme, fontFamily });
		set({ snippet: rebuildSnippet(get().snippet, { theme: newTheme }) });
	},

	setBorderRadius: (borderRadius: number) => {
		const newTheme = Theme.create({ ...get().snippet.theme, borderRadius });
		set({ snippet: rebuildSnippet(get().snippet, { theme: newTheme }) });
	},

	rebuildPlan: async () => {
		if (!rawShikiHighlighter) {
			return;
		}
		const { snippet } = get();
		set({ isBuilding: true });
		await ensureLanguageLoaded(snippet.language);
		if (!rawShikiHighlighter) {
			return;
		}
		const plan = buildMagicMovePlan(
			rawShikiHighlighter,
			effectiveCodes(snippet),
			snippet.language,
			snippet.theme.name,
		);
		const maxIndex = Math.max(0, plan.frames.length - 1);
		set({
			plan,
			isBuilding: false,
			currentStepIndex: Math.min(get().currentStepIndex, maxIndex),
		});
	},

	captureStep: (duration?: number) => {
		const { snippet } = get();
		const step = Step.create({ code: snippet.code, duration });
		set({ snippet: snippet.addStep(step), currentStepIndex: snippet.steps.length });
		get().rebuildPlan();
	},

	removeStep: (stepId: string) => {
		const { snippet, currentStepIndex } = get();
		const updated = snippet.removeStep(stepId);
		const newIndex = Math.min(currentStepIndex, Math.max(0, updated.steps.length - 1));
		set({ snippet: updated, currentStepIndex: newIndex });
		get().rebuildPlan();
	},

	updateStepDuration: (stepId: string, duration: number) => {
		const { snippet } = get();
		const stepIndex = snippet.steps.findIndex((s) => s.id === stepId);
		const oldStep = snippet.steps[stepIndex];
		if (!oldStep) {
			return;
		}
		const newStep = Step.create({
			code: oldStep.code,
			duration,
			highlightRanges: [...oldStep.highlightRanges],
			annotation: oldStep.annotation,
		});
		const steps = [...snippet.steps];
		steps.splice(stepIndex, 1, newStep);
		let rebuilt = Snippet.create({
			title: snippet.title,
			code: snippet.code,
			language: snippet.language,
			theme: snippet.theme,
			renderConfig: snippet.renderConfig,
		});
		for (const s of steps) {
			rebuilt = rebuilt.addStep(s);
		}
		set({ snippet: rebuilt });
	},

	reorderSteps: (orderedIds: string[]) => {
		set({ snippet: get().snippet.reorderSteps(orderedIds) });
		get().rebuildPlan();
	},

	setCurrentStepIndex: (index: number) => {
		set({ currentStepIndex: index });
	},

	play: async () => {
		const { snippet } = get();
		if (snippet.steps.length < 2) {
			return;
		}
		cancelRaf();

		if (!get().plan || get().isBuilding) {
			set({ isPreparing: true });
			await get().rebuildPlan();
		}

		const timeline = buildTimeline(snippet.steps.map((s) => s.duration));
		const start = performance.now();

		set({ isPreparing: false, isPlaying: true, currentStepIndex: 0, playbackProgress: 0 });

		const tick = () => {
			if (!get().isPlaying) {
				return;
			}
			const elapsed = performance.now() - start;
			const pos = locate(timeline, elapsed);
			const activeIndex = pos.phase === "transition" && pos.t >= 0.5 ? pos.index + 1 : pos.index;

			set({
				playback: { phase: pos.phase, index: pos.index, t: pos.t },
				currentStepIndex: activeIndex,
				playbackProgress: pos.progress,
			});

			if (elapsed >= timeline.totalMs) {
				set({
					isPlaying: false,
					playback: null,
					currentStepIndex: snippet.steps.length - 1,
					playbackProgress: 1,
				});
				rafId = null;
				return;
			}
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
	},

	pause: () => {
		cancelRaf();
		set({ isPlaying: false, isPreparing: false, playback: null });
	},

	exportToJson: () => {
		const { snippet, background } = get();
		const data = {
			title: snippet.title,
			code: snippet.code,
			language: snippet.language,
			themeName: snippet.theme.name,
			background,
			steps: snippet.steps.map((step) => ({ code: step.code, duration: step.duration })),
		};
		return JSON.stringify(data, null, 2);
	},

	importFromJson: (json: string) => {
		let data: unknown;
		try {
			data = JSON.parse(json);
		} catch {
			throw new Error("Invalid JSON format");
		}

		if (typeof data !== "object" || data === null) {
			throw new Error("JSON must be an object");
		}

		const obj = data as Record<string, unknown>;

		if (typeof obj.title !== "string" || !obj.title.trim()) {
			throw new Error("Missing or invalid 'title'");
		}
		if (typeof obj.code !== "string" || !obj.code.trim()) {
			throw new Error("Missing or invalid 'code'");
		}
		if (typeof obj.language !== "string" || !obj.language.trim()) {
			throw new Error("Missing or invalid 'language'");
		}
		if (typeof obj.themeName !== "string") {
			throw new Error("Missing or invalid 'themeName'");
		}

		const themeFactories: Record<string, () => Theme> = {
			midnight: Theme.midnight,
			aurora: Theme.aurora,
			frost: Theme.frost,
			dracula: Theme.dracula,
			"one-dark": Theme.oneDark,
			catppuccin: Theme.catppuccin,
			nord: Theme.nord,
		};
		const themeFactory = themeFactories[obj.themeName];
		if (!themeFactory) {
			throw new Error(`Unknown theme '${obj.themeName}'`);
		}

		let snippet = Snippet.create({
			title: obj.title,
			code: obj.code,
			language: obj.language,
			theme: themeFactory(),
		});

		if (Array.isArray(obj.steps)) {
			for (const rawStep of obj.steps) {
				if (typeof rawStep !== "object" || rawStep === null) {
					throw new Error("Each step must be an object");
				}
				const s = rawStep as Record<string, unknown>;
				if (typeof s.code !== "string" || !s.code.trim()) {
					throw new Error("Each step must have a non-empty 'code'");
				}
				const duration = typeof s.duration === "number" ? s.duration : undefined;
				snippet = snippet.addStep(Step.create({ code: s.code, duration }));
			}
		}

		const background = typeof obj.background === "string" ? obj.background : get().background;

		cancelRaf();
		set({
			snippet,
			background,
			currentStepIndex: 0,
			isPlaying: false,
			playback: null,
			playbackProgress: 0,
		});

		get().rebuildPlan();
	},
}));
