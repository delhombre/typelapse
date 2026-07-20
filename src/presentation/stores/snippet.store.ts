import {
	type CodeSnapshot,
	type DiffChapter,
	chapterSnapshots,
	diffToSnapshots,
} from "@/application/diff";
import { formatLineRanges, parseLineRanges } from "@/application/focus/line-ranges";
import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";
import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import type { HighlightRange } from "@/domain/value-objects/highlight-range";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { resolveShikiLanguage } from "@/infrastructure/highlighting/shiki-registry";
import { type WindowChrome, isWindowChrome } from "@/presentation/components/preview/frame-chrome";
import type { Highlighter } from "shiki";
import { create } from "zustand";
import { useExportStore } from "./export.store";

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

	// Window chrome variant
	windowChrome: WindowChrome;
	setWindowChrome: (chrome: WindowChrome) => void;

	// Line numbers
	showLineNumbers: boolean;
	setShowLineNumbers: (show: boolean) => void;
	lineNumberStart: number;
	setLineNumberStart: (start: number) => void;

	// Frame padding
	framePadding: number;
	setFramePadding: (padding: number) => void;

	// Card margin: the mesh gap around the code window (concentric outer radius)
	cardMargin: number;
	setCardMargin: (margin: number) => void;

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
	/** Set the spotlight lines for a step. Applied at render time: no re-tokenize. */
	updateStepFocus: (stepId: string, ranges: HighlightRange[]) => void;
	/** Set the caption shown beneath the frame during a step. */
	updateStepAnnotation: (stepId: string, text: string) => void;
	reorderSteps: (orderedIds: string[]) => void;

	// Record mode: auto-capture a step at each pause while the user types.
	isRecording: boolean;
	/** Arm record mode; anchors a baseline step if the live code is new. */
	startRecording: () => void;
	/** Disarm record mode, flush a trailing step, and clear the pending timer. */
	stopRecording: () => void;

	// Playback
	setCurrentStepIndex: (index: number) => void;
	play: () => void;
	pause: () => void;

	// Import/Export
	exportToJson: () => string;
	importFromJson: (json: string) => void;
	/**
	 * Turn a pasted unified diff into an animated walkthrough: replace the snippet
	 * with the diff's before-state code and a step per hunk stage (before→…→after).
	 * Throws a user-facing Error on unusable input: the caller surfaces it.
	 */
	importDiff: (diffText: string) => void;
	/**
	 * Turn a PR's commits into one chaptered walkthrough: each commit is a chapter
	 * (its own windowed staged sequence), played in order. Applies the SAME
	 * MAX_DIFF_STEPS cap and caption wiring as {@link importDiff}. Throws when no
	 * chapter carries changes, before any mutation, so the snippet stays intact.
	 */
	importChapters: (chapters: DiffChapter[], meta: { title: string }) => void;
}

let rawShikiHighlighter: Highlighter | null = null;
let rafId: number | null = null;
let recordTimerId: ReturnType<typeof setTimeout> | null = null;

/** A pause this long after the last keystroke captures a step while recording. */
const RECORD_DEBOUNCE_MS = 1500;

/** Per-step hold applied to each step generated from a diff. */
const DIFF_STEP_DURATION = 1200;

/** Upper bound on diff-generated steps so a pathological diff can't explode playback. */
const MAX_DIFF_STEPS = 40;

/** Selectable mesh margins (px) around the code window; the UI offers exactly these. */
const CARD_MARGINS = [16, 24, 32, 48, 64] as const;

/** Default mesh margin, and the fallback for absent or invalid serialized input. */
const DEFAULT_CARD_MARGIN = 32;

/**
 * Snap an untrusted margin to the nearest valid preset. Defensive against
 * hand-edited JSON and share links: a non-numeric value falls back to the
 * default, an out-of-set value clamps to the closest allowed margin.
 */
function normalizeCardMargin(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_CARD_MARGIN;
	}
	return CARD_MARGINS.reduce((best, margin) =>
		Math.abs(margin - value) < Math.abs(best - value) ? margin : best,
	);
}

/**
 * Apply the export-store-owned settings (tempo / typewriter / zoom / progress
 * style) carried by an imported snapshot or share link. Each is applied only when
 * present and valid, so an older file that omits them keeps the current values
 * (the defaults on a fresh load): back-compatible by construction.
 */
function applyExportSettings(obj: Record<string, unknown>): void {
	const ex = useExportStore.getState();
	const { transitionMs, typewriter, focusZoom, progressStyle } = obj;
	if (transitionMs === 400 || transitionMs === 650 || transitionMs === 1000) {
		ex.setTransitionMs(transitionMs);
	}
	if (typeof typewriter === "boolean") {
		ex.setTypewriter(typewriter);
	}
	if (typeof focusZoom === "boolean") {
		ex.setFocusZoom(focusZoom);
	}
	if (progressStyle === "reels" || progressStyle === "bar" || progressStyle === "none") {
		ex.setProgressStyle(progressStyle);
	}
}

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

/**
 * Rebuild the snippet with one step swapped for an edited clone. The edit MUST
 * go through `Step.with` so the step keeps its id: React keys, drag state and
 * captured ids all rely on step identity surviving an edit. Returns null when
 * no step matches (silent no-op at the call site).
 */
function replaceStep(snippet: Snippet, stepId: string, edit: (step: Step) => Step): Snippet | null {
	const index = snippet.steps.findIndex((s) => s.id === stepId);
	const step = snippet.steps[index];
	if (!step) {
		return null;
	}
	const steps = [...snippet.steps];
	steps.splice(index, 1, edit(step));
	return withSteps(snippet, steps);
}

/** Rebuild a snippet with a replacement steps array, keeping everything else. */
function withSteps(snippet: Snippet, steps: Step[]): Snippet {
	let rebuilt = Snippet.create({
		title: snippet.title,
		code: snippet.code,
		language: snippet.language,
		theme: snippet.theme,
		renderConfig: snippet.renderConfig,
	});
	for (const step of steps) {
		rebuilt = rebuilt.addStep(step);
	}
	return rebuilt;
}

function cancelRaf() {
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
}

function clearRecordTimer() {
	if (recordTimerId !== null) {
		clearTimeout(recordTimerId);
		recordTimerId = null;
	}
}

/**
 * True when the live code is worth capturing as a new step: non-blank and
 * different from the last captured step (or there are no steps yet). Blank is
 * excluded because `Step.create` rejects empty code.
 */
function isCapturable(snippet: Snippet): boolean {
	if (snippet.code.trim() === "") {
		return false;
	}
	const lastStep = snippet.steps[snippet.steps.length - 1];
	return !lastStep || lastStep.code !== snippet.code;
}

/** The codes the plan animates over: the captured steps, or the live code. */
function effectiveCodes(snippet: Snippet): string[] {
	return snippet.steps.length > 0 ? snippet.steps.map((s) => s.code) : [snippet.code];
}

/**
 * Cap diff snapshots at {@link MAX_DIFF_STEPS}, always keeping the final "after"
 * frame so the walkthrough still ends on the complete change (only pathologically
 * large diffs are ever trimmed).
 */
function capSnapshots(snapshots: CodeSnapshot[]): CodeSnapshot[] {
	if (snapshots.length <= MAX_DIFF_STEPS) {
		return snapshots;
	}
	const last = snapshots[snapshots.length - 1];
	const head = snapshots.slice(0, MAX_DIFF_STEPS - 1);
	return last ? [...head, last] : head;
}

/** The playback fields reset whenever an import replaces the whole snippet. */
const PLAYBACK_RESET = {
	currentStepIndex: 0,
	isPlaying: false,
	isPreparing: false,
	playbackProgress: 0,
	playback: null,
	isRecording: false,
} as const;

/**
 * Build the snippet a diff or chapters import replaces the studio with: cap the
 * staged snapshots, open on the first frame's before-state, and turn each snapshot
 * into a step whose caption is its label. Pure: the caller commits it and rebuilds
 * the plan. A blank title or absent language falls back to the current snippet's.
 */
function buildDiffSnippet(
	base: Snippet,
	snapshots: CodeSnapshot[],
	meta: { title?: string; language?: string },
): Snippet {
	const staged = capSnapshots(snapshots);
	// Open on the "before" state (first frame); playback morphs forward to "after".
	const beforeCode = staged[0]?.code ?? base.code;
	let rebuilt = Snippet.create({
		title: meta.title ? meta.title : base.title,
		code: beforeCode,
		language: meta.language ?? base.language,
		theme: base.theme,
		renderConfig: base.renderConfig,
	});
	for (const snapshot of staged) {
		// The snapshot's label ("Before" / a hunk heading / "After" / a "k/N · subject"
		// chapter head) narrates the step, so it lands as the caption and the
		// walkthrough explains itself. An empty label leaves the caption unset.
		const annotation = snapshot.label ? snapshot.label : undefined;
		rebuilt = rebuilt.addStep(
			Step.create({ code: snapshot.code, duration: DIFF_STEP_DURATION, annotation }),
		);
	}
	return rebuilt;
}

/**
 * The Shiki language for a chaptered import: the first chapter whose primary file
 * has a recognizable extension. Reuses diffToSnapshots' own inference so chapters
 * tag their language exactly as a single-diff import would; a lockfiles-only or
 * unparseable chapter carries none, so we try the next.
 */
function inferChapterLanguage(chapters: DiffChapter[]): string | undefined {
	for (const chapter of chapters) {
		try {
			const { language } = diffToSnapshots(chapter.diffText);
			if (language) {
				return language;
			}
		} catch {
			// No usable diff in this chapter: its language is undecidable, try the next.
		}
	}
	return undefined;
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
	isRecording: false,
	background: "mesh:aurora",

	windowChrome: "macos",

	setWindowChrome: (chrome: WindowChrome) => {
		set({ windowChrome: chrome });
	},

	showLineNumbers: true,

	setShowLineNumbers: (show: boolean) => {
		set({ showLineNumbers: show });
	},

	lineNumberStart: 1,

	setLineNumberStart: (start: number) => {
		set({ lineNumberStart: Math.max(1, Math.floor(start)) });
	},

	framePadding: 24,

	setFramePadding: (padding: number) => {
		set({ framePadding: padding });
	},

	cardMargin: DEFAULT_CARD_MARGIN,

	setCardMargin: (margin: number) => {
		set({ cardMargin: margin });
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
		// While recording, each keystroke re-arms the debounce; a pause captures a step.
		if (get().isRecording) {
			clearRecordTimer();
			recordTimerId = setTimeout(() => {
				recordTimerId = null;
				if (get().isRecording && isCapturable(get().snippet)) {
					get().captureStep();
				}
			}, RECORD_DEBOUNCE_MS);
		}
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
		const updated = replaceStep(get().snippet, stepId, (step) => step.with({ duration }));
		if (updated) {
			set({ snippet: updated });
		}
	},

	updateStepFocus: (stepId: string, ranges: HighlightRange[]) => {
		// Focus is applied at render time (resolveView), so no plan rebuild needed.
		const updated = replaceStep(get().snippet, stepId, (step) =>
			step.with({ highlightRanges: ranges }),
		);
		if (updated) {
			set({ snippet: updated });
		}
	},

	updateStepAnnotation: (stepId: string, text: string) => {
		// Captions overlay at render time, so no plan rebuild is needed.
		const trimmed = text.trim();
		const updated = replaceStep(get().snippet, stepId, (step) =>
			step.with({ annotation: trimmed ? trimmed : undefined }),
		);
		if (updated) {
			set({ snippet: updated });
		}
	},

	reorderSteps: (orderedIds: string[]) => {
		set({ snippet: get().snippet.reorderSteps(orderedIds) });
		get().rebuildPlan();
	},

	startRecording: () => {
		set({ isRecording: true });
		// Anchor a baseline so the first pause morphs from the code as it is now.
		if (isCapturable(get().snippet)) {
			get().captureStep();
		}
	},

	stopRecording: () => {
		clearRecordTimer();
		if (!get().isRecording) {
			return;
		}
		set({ isRecording: false });
		// Flush the final edit so the last thing typed still becomes a step.
		if (isCapturable(get().snippet)) {
			get().captureStep();
		}
	},

	setCurrentStepIndex: (index: number) => {
		set({ currentStepIndex: index });
	},

	play: async () => {
		// Recording and playback are mutually exclusive; stopping flushes a trailing step.
		get().stopRecording();
		const { snippet } = get();
		if (snippet.steps.length < 2) {
			return;
		}
		cancelRaf();

		if (!get().plan || get().isBuilding) {
			set({ isPreparing: true });
			await get().rebuildPlan();
		}

		// Read the morph tempo from the export store so the preview and the exported
		// video share one timing source (WYSIWYG).
		const transitionMs = useExportStore.getState().transitionMs;
		const timeline = buildTimeline(
			snippet.steps.map((s) => s.duration),
			transitionMs,
		);
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
		const {
			snippet,
			background,
			windowChrome,
			showLineNumbers,
			lineNumberStart,
			framePadding,
			cardMargin,
			watermark,
		} = get();
		// The export store owns tempo / typewriter / zoom / progress style; pull
		// them in so a single JSON file captures the ENTIRE studio state.
		const { transitionMs, typewriter, focusZoom, progressStyle } = useExportStore.getState();
		const data = {
			title: snippet.title,
			code: snippet.code,
			language: snippet.language,
			themeName: snippet.theme.name,
			background,
			windowChrome,
			showLineNumbers,
			lineNumberStart,
			framePadding,
			cardMargin,
			watermark,
			progressStyle,
			typewriter,
			focusZoom,
			transitionMs,
			steps: snippet.steps.map((step) => {
				const focus = formatLineRanges(step.highlightRanges);
				const serialized: {
					code: string;
					duration: number;
					focus?: string;
					caption?: string;
				} = {
					code: step.code,
					duration: step.duration,
				};
				if (focus) {
					serialized.focus = focus;
				}
				if (step.annotation) {
					serialized.caption = step.annotation;
				}
				return serialized;
			}),
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
				// Defensive: unknown/invalid focus strings degrade to "no focus".
				let highlightRanges: HighlightRange[] = [];
				if (typeof s.focus === "string") {
					highlightRanges = parseLineRanges(s.focus) ?? [];
				}
				const annotation =
					typeof s.caption === "string" && s.caption.trim() ? s.caption : undefined;
				snippet = snippet.addStep(
					Step.create({ code: s.code, duration, highlightRanges, annotation }),
				);
			}
		}

		const background = typeof obj.background === "string" ? obj.background : get().background;
		// Defensive: unknown/missing chrome degrades to the default macOS chrome.
		const windowChrome = isWindowChrome(obj.windowChrome) ? obj.windowChrome : "macos";
		// Defensive: line-number settings default to on / start at 1 when absent.
		const showLineNumbers = typeof obj.showLineNumbers === "boolean" ? obj.showLineNumbers : true;
		const lineNumberStart =
			typeof obj.lineNumberStart === "number" && obj.lineNumberStart >= 1
				? Math.floor(obj.lineNumberStart)
				: 1;
		// Defensive: absent or out-of-set margins snap to a valid preset (default 32).
		const cardMargin = normalizeCardMargin(obj.cardMargin);
		// Defensive: absent/invalid framePadding and watermark fall back to defaults.
		const framePadding =
			typeof obj.framePadding === "number" && Number.isFinite(obj.framePadding)
				? obj.framePadding
				: 24;
		const watermark = typeof obj.watermark === "string" ? obj.watermark : "";

		cancelRaf();
		clearRecordTimer();
		set({
			snippet,
			background,
			windowChrome,
			showLineNumbers,
			lineNumberStart,
			framePadding,
			cardMargin,
			watermark,
			currentStepIndex: 0,
			isPlaying: false,
			playback: null,
			playbackProgress: 0,
			isRecording: false,
		});
		// The export store owns tempo / typewriter / zoom / progress style: apply
		// those from the same snapshot so a JSON file or share link restores them too.
		applyExportSettings(obj);

		get().rebuildPlan();
	},

	importDiff: (diffText: string) => {
		// diffToSnapshots throws a user-facing Error on unusable input; it runs
		// before any set(), so a bad paste leaves the current snippet untouched.
		const { snapshots, language, path } = diffToSnapshots(diffText);
		// Adopt the changed file's name as the title, like URL import does.
		const rebuilt = buildDiffSnippet(get().snippet, snapshots, {
			title: path?.split("/").pop(),
			language,
		});

		cancelRaf();
		clearRecordTimer();
		set({ snippet: rebuilt, ...PLAYBACK_RESET });

		get().rebuildPlan();
	},

	importChapters: (chapters: DiffChapter[], meta: { title: string }) => {
		// chapterSnapshots skips lockfiles-only / empty chapters; if that leaves
		// nothing to animate we throw before any set(), so a dead PR leaves the
		// current snippet untouched, exactly like importDiff's contract.
		const snapshots = chapterSnapshots(chapters);
		if (snapshots.length === 0) {
			throw new Error("These commits contain no changes to animate");
		}
		const rebuilt = buildDiffSnippet(get().snippet, snapshots, {
			title: meta.title,
			language: inferChapterLanguage(chapters),
		});

		cancelRaf();
		clearRecordTimer();
		set({ snippet: rebuilt, ...PLAYBACK_RESET });

		get().rebuildPlan();
	},
}));
