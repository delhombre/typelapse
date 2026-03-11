import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";
import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import { create } from "zustand";

interface SnippetState {
	snippet: Snippet;
	highlightedHtml: string;
	isHighlighting: boolean;

	// Steps & playback
	stepFrames: string[];
	currentStepIndex: number;
	isPlaying: boolean;
	isPreparing: boolean;
	playbackProgress: number; // 0-1 overall progress

	// Background
	background: string;
	setBackground: (bg: string) => void;

	// Frame padding
	framePadding: number;
	setFramePadding: (padding: number) => void;

	// Editor ↔ Preview theme sync
	syncEditorTheme: boolean;
	setSyncEditorTheme: (sync: boolean) => void;

	setCode: (code: string) => void;
	setLanguage: (language: string) => void;
	setTitle: (title: string) => void;
	setTheme: (theme: Theme) => void;
	refreshHighlight: () => Promise<void>;

	// Step management
	captureStep: (duration?: number) => void;
	removeStep: (stepId: string) => void;
	updateStepDuration: (stepId: string, duration: number) => void;
	reorderSteps: (orderedIds: string[]) => void;
	highlightAllSteps: () => Promise<void>;

	// Playback
	setCurrentStepIndex: (index: number) => void;
	play: () => void;
	pause: () => void;

	// Import/Export
	exportToJson: () => string;
	importFromJson: (json: string) => void;
}

let highlighterInstance: HighlighterPort | null = null;
let playbackTimer: ReturnType<typeof setTimeout> | null = null;

// Raw Shiki highlighter for shiki-magic-move (set alongside the adapter)
// biome-ignore lint/suspicious/noExplicitAny: Raw Shiki Highlighter type varies between versions
let rawShikiHighlighter: any = null;

export function setHighlighter(highlighter: HighlighterPort) {
	highlighterInstance = highlighter;
	// Extract raw Shiki instance if available
	if ("getRawHighlighter" in highlighter) {
		(highlighter as { getRawHighlighter: () => Promise<unknown> })
			.getRawHighlighter()
			.then((h) => {
				rawShikiHighlighter = h;
			});
	}
}

export function getRawShikiHighlighter() {
	return rawShikiHighlighter;
}

const DEFAULT_CODE = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Typelapse"));`;

function rebuildSnippet(
	snippet: Snippet,
	overrides: Partial<{ title: string; code: string; language: string; theme: Theme }>,
): Snippet {
	const base = {
		title: overrides.title ?? snippet.title,
		code: overrides.code ?? snippet.code,
		language: overrides.language ?? snippet.language,
		theme: overrides.theme ?? snippet.theme,
		renderConfig: snippet.renderConfig,
	};
	let updated = Snippet.create(base);
	for (const step of snippet.steps) {
		updated = updated.addStep(step);
	}
	return updated;
}

function clearTimers() {
	if (playbackTimer) {
		clearTimeout(playbackTimer);
		playbackTimer = null;
	}
}

/** Advance to next step after hold duration */
function scheduleNextStep(
	stepIndex: number,
	totalSteps: number,
	steps: readonly Step[],
	get: () => SnippetState,
	set: (partial: Partial<SnippetState>) => void,
) {
	if (!get().isPlaying || stepIndex >= totalSteps) {
		set({
			isPlaying: false,
			currentStepIndex: totalSteps - 1,
			playbackProgress: 1,
		});
		return;
	}

	const step = steps[stepIndex];
	if (!step) {
		return;
	}

	set({
		currentStepIndex: stepIndex,
		playbackProgress: stepIndex / Math.max(totalSteps - 1, 1),
	});

	playbackTimer = setTimeout(() => {
		scheduleNextStep(stepIndex + 1, totalSteps, steps, get, set);
	}, step.duration);
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
	snippet: Snippet.create({
		title: "Untitled",
		code: DEFAULT_CODE,
		language: "typescript",
	}),
	highlightedHtml: "",
	isHighlighting: false,
	stepFrames: [],
	currentStepIndex: 0,
	isPlaying: false,
	isPreparing: false,
	playbackProgress: 0,
	background: "radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, #0d1117 50%, #0a0e14 100%)",

	framePadding: 24,

	setFramePadding: (padding: number) => {
		set({ framePadding: padding });
	},

	syncEditorTheme: false,

	setSyncEditorTheme: (sync: boolean) => {
		set({ syncEditorTheme: sync });
	},

	setBackground: (bg: string) => {
		set({ background: bg });
	},

	setCode: (code: string) => {
		const { snippet } = get();
		set({ snippet: rebuildSnippet(snippet, { code }) });
		get().refreshHighlight();
	},

	setLanguage: (language: string) => {
		const { snippet } = get();
		set({ snippet: rebuildSnippet(snippet, { language }) });
		get().refreshHighlight();
		get().highlightAllSteps();
	},

	setTitle: (title: string) => {
		const { snippet } = get();
		set({ snippet: rebuildSnippet(snippet, { title }) });
	},

	setTheme: (theme: Theme) => {
		const { snippet } = get();
		set({ snippet: rebuildSnippet(snippet, { theme }) });
		get().refreshHighlight();
		get().highlightAllSteps();
	},

	refreshHighlight: async () => {
		if (!highlighterInstance) {
			return;
		}
		const { snippet } = get();
		set({ isHighlighting: true });
		const html = await highlighterInstance.highlight(
			snippet.code,
			snippet.language,
			snippet.theme.name,
		);
		set({ highlightedHtml: html, isHighlighting: false });
	},

	captureStep: (duration?: number) => {
		const { snippet } = get();
		const step = Step.create({ code: snippet.code, duration });
		const updated = snippet.addStep(step);
		set({ snippet: updated });
		get().highlightAllSteps();
	},

	removeStep: (stepId: string) => {
		const { snippet, currentStepIndex } = get();
		const updated = snippet.removeStep(stepId);
		const newIndex = Math.min(currentStepIndex, Math.max(0, updated.steps.length - 1));
		set({ snippet: updated, currentStepIndex: newIndex });
		get().highlightAllSteps();
	},

	updateStepDuration: (stepId: string, duration: number) => {
		const { snippet } = get();
		const stepIndex = snippet.steps.findIndex((s) => s.id === stepId);
		if (stepIndex === -1) {
			return;
		}
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
		const updated = snippet.removeStep(stepId);
		const steps = [...updated.steps];
		steps.splice(stepIndex, 0, newStep);
		let rebuilt = Snippet.create({
			title: updated.title,
			code: updated.code,
			language: updated.language,
			theme: updated.theme,
			renderConfig: updated.renderConfig,
		});
		for (const s of steps) {
			rebuilt = rebuilt.addStep(s);
		}
		set({ snippet: rebuilt });
	},

	reorderSteps: (orderedIds: string[]) => {
		const { snippet } = get();
		const updated = snippet.reorderSteps(orderedIds);
		set({ snippet: updated });
		get().highlightAllSteps();
	},

	highlightAllSteps: async () => {
		if (!highlighterInstance) {
			return;
		}
		const { snippet } = get();
		const highlighter = highlighterInstance;
		const frames = await Promise.all(
			snippet.steps.map((step) =>
				highlighter.highlight(step.code, snippet.language, snippet.theme.name),
			),
		);
		set({ stepFrames: frames });
	},

	setCurrentStepIndex: (index: number) => {
		set({ currentStepIndex: index });
	},

	play: async () => {
		const { snippet, stepFrames } = get();
		if (snippet.steps.length < 2) {
			return;
		}

		clearTimers();

		// Ensure step frames are highlighted
		if (stepFrames.length !== snippet.steps.length && highlighterInstance) {
			set({ isPreparing: true });
			await get().highlightAllSteps();
			if (!get().isPreparing) {
				return;
			}
		}

		set({
			isPreparing: false,
			isPlaying: true,
			currentStepIndex: 0,
			playbackProgress: 0,
		});

		scheduleNextStep(0, snippet.steps.length, snippet.steps, get, set);
	},

	pause: () => {
		clearTimers();
		set({ isPlaying: false, isPreparing: false });
	},

	exportToJson: () => {
		const { snippet, background } = get();
		const data = {
			title: snippet.title,
			code: snippet.code,
			language: snippet.language,
			themeName: snippet.theme.name,
			background,
			steps: snippet.steps.map((step) => ({
				code: step.code,
				duration: step.duration,
			})),
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
		};
		const themeFactory = themeFactories[obj.themeName];
		if (!themeFactory) {
			throw new Error(`Unknown theme '${obj.themeName}'. Expected: midnight, aurora, or frost`);
		}
		const theme = themeFactory();

		let snippet = Snippet.create({
			title: obj.title,
			code: obj.code,
			language: obj.language,
			theme,
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
				const step = Step.create({ code: s.code, duration });
				snippet = snippet.addStep(step);
			}
		}

		const background = typeof obj.background === "string" ? obj.background : get().background;

		set({
			snippet,
			background,
			currentStepIndex: 0,
			isPlaying: false,
			playbackProgress: 0,
		});

		get().refreshHighlight();
		get().highlightAllSteps();
	},
}));
