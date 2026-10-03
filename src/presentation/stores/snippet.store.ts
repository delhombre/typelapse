import {
	type CodeSnapshot,
	type DiffChapter,
	chapterSnapshots,
	diffToSnapshots,
} from "@/application/diff";
import { formatLineRanges, parseLineRanges } from "@/application/focus/line-ranges";
import { DIFF_STEP_DURATION, capDiffSnapshots } from "@/application/import/diff-project";
import { DEFAULT_TRANSITION_EASING, isCubicBezier } from "@/application/magic-move/easing";
import { assertImportableCode } from "@/application/project/project-document";
import { type ProjectContent, contentFingerprint } from "@/application/project/project-fingerprint";
import {
	type ProjectPayload,
	type ProjectStepPayload,
	isProjectFps,
} from "@/application/project/project-payload";
import { openStudioDocument } from "@/application/project/studio-document";
import {
	type StudioPlaybackPhase,
	type StudioPlaybackPosition,
	type StudioPlaybackTimeline,
	buildStudioPlayback,
	isPlayableProject,
	locateStudioPlayback,
	visibleSceneIndex,
} from "@/application/studio-timeline/playback";
import { MAX_RENDER_DIMENSION, MIN_RENDER_DIMENSION } from "@/domain/entities/render-config";
import { Snippet } from "@/domain/entities/snippet";
import { Step, captionFromGeneratedLabel } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";
import type { HighlighterPort } from "@/domain/ports/highlighter.port";
import type { HighlightRange } from "@/domain/value-objects/highlight-range";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { resolveShikiLanguage } from "@/infrastructure/highlighting/shiki-registry";
import type { WindowChrome } from "@/presentation/components/preview/frame-chrome";
import type { Highlighter } from "shiki";
import { create } from "zustand";
import { EXPORT_DEFAULTS, useExportStore } from "./export.store";

/** Where playback currently sits: holding on a step, morphing between two, or looping back. */
export interface PlaybackState {
	phase: StudioPlaybackPhase;
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
	/** The canonical clock; meaningful while `playback` is not null. */
	playbackElapsedMs: number;
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
	duplicateStep: (stepId: string) => void;
	removeStep: (stepId: string) => void;
	restoreStep: (step: Step, index: number) => void;
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
	/** Hold an exact WYSIWYG frame while the timeline scrubber is being moved. */
	seekPlayback: (progress: number) => void;
	play: () => void;
	pause: () => void;

	// Import/Export
	/**
	 * The whole studio as a project payload: the single producer of the format.
	 * JSON export stringifies it, share links encode it, and the template catalog
	 * is authored in it, so the four paths can never drift apart.
	 */
	toProjectPayload: () => ProjectPayload;
	exportToJson: () => string;
	/**
	 * Fingerprint of the project as it stood at the last load. Everything that
	 * replaces the whole studio re-baselines it, so "edited" always means "edited
	 * since the thing currently on screen arrived".
	 */
	baselineFingerprint: string;
	/**
	 * True when the studio holds work the user authored since the last load: what
	 * a destructive action (loading a template) must confirm before discarding.
	 */
	hasUnsavedEdits: () => boolean;
	importFromJson: (json: string) => void;
	/**
	 * Turn a pasted unified diff into an animated walkthrough: replace the snippet
	 * with the diff's before-state code and a step per hunk stage (before→…→after).
	 * Throws a user-facing Error on unusable input: the caller surfaces it.
	 */
	importDiff: (diffText: string) => void;
	/**
	 * Replace the studio with a plain code paste: no steps, one static frame.
	 *
	 * Not the same as {@link setCode}, which keeps whatever steps are already
	 * there — and since the plan animates the steps when there are any, pasting
	 * code over a diff import would leave the paste invisible behind the old
	 * walkthrough. An import replaces; an edit does not. Throws on blank code,
	 * before any mutation, like its two siblings.
	 */
	importSnippet: (code: string, meta?: { title?: string; language?: string }) => void;
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

/** Default mesh margin, and the fallback for absent or invalid serialized input. */
const DEFAULT_CARD_MARGIN = 32;

/**
 * True for a plausible pixel dimension. Guards the aspect against hand-edited
 * files and stale share links: a zero, a negative or an absurd size would
 * otherwise reach the renderer.
 *
 * The bounds are the renderer's own (see {@link MAX_RENDER_DIMENSION}), not a
 * second opinion about them: a size the studio accepts must survive the render
 * route untouched, or the preview promises an aspect the export will not keep.
 */
function isDimension(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_RENDER_DIMENSION &&
		value <= MAX_RENDER_DIMENSION
	);
}

/**
 * Apply the export-store-owned settings (aspect / tempo / typewriter / zoom /
 * progress style) carried by an imported snapshot, share link or template.
 *
 * A project fully determines the render: a setting the file omits is reset to
 * its default rather than inherited. Without that, opening the typewriter
 * template and then any other one would leave the second typing itself, and no
 * file would ever be reproducible from its own contents.
 */
function applyExportSettings(obj: ProjectPayload): void {
	const ex = useExportStore.getState();
	const { transitionMs, transitionEasing, typewriter, focusZoom, progressStyle, width, height } =
		obj;
	// Both or neither: a half-specified aspect would silently distort the export.
	if (isDimension(width) && isDimension(height)) {
		ex.setResolution(width, height);
	} else {
		ex.setResolution(EXPORT_DEFAULTS.width, EXPORT_DEFAULTS.height);
	}
	const isTempo = transitionMs === 400 || transitionMs === 650 || transitionMs === 1000;
	ex.setTransitionMs(isTempo ? transitionMs : EXPORT_DEFAULTS.transitionMs);
	ex.setTransitionEasing(
		isCubicBezier(transitionEasing) ? transitionEasing : DEFAULT_TRANSITION_EASING,
	);
	ex.setTypewriter(typewriter === true);
	ex.setFocusZoom(focusZoom === true);
	const isProgress =
		progressStyle === "reels" || progressStyle === "bar" || progressStyle === "none";
	ex.setProgressStyle(isProgress ? progressStyle : EXPORT_DEFAULTS.progressStyle);
	ex.setFps(isProjectFps(obj.fps) ? obj.fps : EXPORT_DEFAULTS.fps);
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

/** What the composition adds to the scene plan, as far as the playback clock cares. */
export interface PlaybackComposition {
	/** `compileSceneTimeline`'s duration: the scenes plus the audio tail. */
	durationMs: number;
	/** Authored media send the export down the multimedia route, which has no loop morph. */
	hasAuthoredMedia: boolean;
}

let readPlaybackComposition: () => PlaybackComposition = () => ({
	durationMs: 0,
	hasAuthoredMedia: false,
});

/**
 * The composition store registers its reader here. It imports this store, so
 * importing it back would be a cycle that runs its initialiser too early.
 */
export function registerPlaybackComposition(read: () => PlaybackComposition): void {
	readPlaybackComposition = read;
}

/**
 * The timeline the preview plays, built from the inputs the export reads, or
 * null when the project is not a video yet (no scene and no authored media).
 */
export function studioPlaybackTimeline(): StudioPlaybackTimeline | null {
	const { steps } = useSnippetStore.getState().snippet;
	const composition = readPlaybackComposition();
	if (!isPlayableProject(steps.length, composition.hasAuthoredMedia)) {
		return null;
	}
	const { transitionMs, loop } = useExportStore.getState();
	return buildStudioPlayback({
		durations: steps.map((step) => step.duration),
		transitionMs,
		loop: loop && !composition.hasAuthoredMedia,
		canonicalMs: composition.durationMs,
	});
}

function playbackFields(position: StudioPlaybackPosition, sceneCount: number) {
	return {
		playback: { phase: position.phase, index: position.index, t: position.t },
		playbackProgress: position.progress,
		playbackElapsedMs: position.elapsedMs,
		currentStepIndex: visibleSceneIndex(position, sceneCount),
	};
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
 * The authored half of the project: everything this store owns. Split out from
 * the full payload because it is also what the unsaved-work warning compares,
 * and because reading it must NOT touch the export store: the two stores import
 * each other, so a module-load read of the export store would come back
 * undefined.
 */
function contentOf(state: SnippetState): ProjectContent {
	const { snippet } = state;
	return {
		title: snippet.title,
		code: snippet.code,
		language: snippet.language,
		themeName: snippet.theme.name,
		// The two theme fields the studio edits in place, leaving the name alone.
		fontFamily: snippet.theme.fontFamily,
		borderRadius: snippet.theme.borderRadius,
		background: state.background,
		windowChrome: state.windowChrome,
		showLineNumbers: state.showLineNumbers,
		lineNumberStart: state.lineNumberStart,
		framePadding: state.framePadding,
		cardMargin: state.cardMargin,
		watermark: state.watermark,
		steps: snippet.steps.map((step) => {
			const focus = formatLineRanges(step.highlightRanges);
			const serialized: ProjectStepPayload = {
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
	const staged = capDiffSnapshots(snapshots);
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
		// The label is generated, never typed: a git section heading can be any
		// length, so it is shortened here rather than allowed to fail the import.
		const annotation = captionFromGeneratedLabel(snapshot.label);
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
	playbackElapsedMs: 0,
	playback: null,
	isRecording: false,
	background: "mesh:solar",

	// Seeded below, from the store's own producer, so the default studio starts
	// out pristine without restating the defaults here.
	baselineFingerprint: "",

	hasUnsavedEdits: () => contentFingerprint(contentOf(get())) !== get().baselineFingerprint,

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
		cancelRaf();
		set({
			snippet: rebuildSnippet(get().snippet, { code }),
			isPlaying: false,
			isPreparing: false,
			playback: null,
		});
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
			snippet.theme.background,
			// The loop morph is planned whether or not Loop is on, so the toggle
			// changes playback at once instead of waiting for a rebuild.
			true,
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

	duplicateStep: (stepId: string) => {
		const { snippet } = get();
		const index = snippet.steps.findIndex((step) => step.id === stepId);
		const source = snippet.steps[index];
		if (!source) {
			return;
		}
		const copy = Step.create({
			code: source.code,
			duration: source.duration,
			highlightRanges: [...source.highlightRanges],
			annotation: source.annotation,
		});
		set({ snippet: snippet.insertStep(copy, index + 1), currentStepIndex: index + 1 });
		get().rebuildPlan();
	},

	removeStep: (stepId: string) => {
		const { snippet, currentStepIndex } = get();
		const updated = snippet.removeStep(stepId);
		const newIndex = Math.min(currentStepIndex, Math.max(0, updated.steps.length - 1));
		set({ snippet: updated, currentStepIndex: newIndex });
		get().rebuildPlan();
	},

	restoreStep: (step: Step, index: number) => {
		const { snippet } = get();
		if (snippet.steps.some((candidate) => candidate.id === step.id)) {
			return;
		}
		const safeIndex = Math.min(Math.max(index, 0), snippet.steps.length);
		set({ snippet: snippet.insertStep(step, safeIndex), currentStepIndex: safeIndex });
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
		set({ currentStepIndex: index, playback: null });
	},

	seekPlayback: (progress: number) => {
		cancelRaf();
		const timeline = studioPlaybackTimeline();
		if (!timeline) {
			set({ isPlaying: false, isPreparing: false, playback: null, playbackProgress: 0 });
			return;
		}
		const safeProgress = Math.min(Math.max(progress, 0), 1);
		set({
			isPlaying: false,
			isPreparing: false,
			...playbackFields(
				locateStudioPlayback(timeline, safeProgress * timeline.totalMs),
				get().snippet.steps.length,
			),
		});
	},

	play: async () => {
		// Recording and playback are mutually exclusive; stopping flushes a trailing step.
		get().stopRecording();
		if (!studioPlaybackTimeline()) {
			return;
		}
		cancelRaf();

		if (!get().plan || get().isBuilding) {
			set({ isPreparing: true });
			await get().rebuildPlan();
		}

		// One clock for the preview and the file: the scene plan, the loop morph
		// where the export adds it, and the audio tail (WYSIWYG).
		const timeline = studioPlaybackTimeline();
		if (!timeline) {
			set({ isPreparing: false });
			return;
		}
		const sceneCount = get().snippet.steps.length;
		const state = get();
		const selectedHold = timeline.segments.find(
			(segment) => segment.type === "hold" && segment.index === state.currentStepIndex,
		);
		const resumesExactFrame = state.playback !== null && state.playbackProgress < 1;
		const startElapsedMs = resumesExactFrame
			? Math.min(Math.max(state.playbackProgress, 0), 1) * timeline.totalMs
			: (selectedHold?.startMs ?? 0);
		const start = performance.now();

		set({
			isPreparing: false,
			isPlaying: true,
			...playbackFields(locateStudioPlayback(timeline, startElapsedMs), sceneCount),
		});

		const tick = () => {
			if (!get().isPlaying) {
				return;
			}
			const elapsed = startElapsedMs + performance.now() - start;
			const finished = elapsed >= timeline.totalMs;
			set({
				...playbackFields(locateStudioPlayback(timeline, elapsed), sceneCount),
				...(finished ? { isPlaying: false } : {}),
			});
			if (finished) {
				rafId = null;
				return;
			}
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
	},

	pause: () => {
		cancelRaf();
		set({ isPlaying: false, isPreparing: false });
	},

	toProjectPayload: () => {
		// The export store owns aspect / tempo / typewriter / zoom / progress style;
		// pull them in so a single JSON file captures the ENTIRE studio state.
		const {
			transitionMs,
			transitionEasing,
			typewriter,
			focusZoom,
			progressStyle,
			width,
			height,
			fps,
		} = useExportStore.getState();
		return {
			...contentOf(get()),
			progressStyle,
			typewriter,
			focusZoom,
			transitionMs,
			transitionEasing,
			width,
			height,
			// Absent means the default, so a project that never chose a rate keeps
			// the file it always had.
			...(isProjectFps(fps) && fps !== EXPORT_DEFAULTS.fps ? { fps } : {}),
		};
	},

	exportToJson: () => JSON.stringify(get().toProjectPayload(), null, 2),

	importFromJson: (json: string) => {
		let data: unknown;
		try {
			data = JSON.parse(json);
		} catch {
			throw new Error("Invalid JSON format");
		}

		// A V2 file (layers, media, audio) or a legacy V1 file, read into the code
		// spine this store owns. The V2 aggregate is validated in there, before any
		// set(), so a file the composition would refuse never replaces the snippet
		// first and then fails halfway. Steps take their scene ids: the same file
		// always opens with the same ids, and the layers above a scene stay on it.
		const obj = openStudioDocument(data).spine;

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

		const factoryTheme = themeFactory();
		const fontFamily =
			typeof obj.fontFamily === "string" && obj.fontFamily.trim().length > 0
				? obj.fontFamily
				: factoryTheme.fontFamily;
		const borderRadius =
			typeof obj.borderRadius === "number" &&
			Number.isFinite(obj.borderRadius) &&
			obj.borderRadius >= 0 &&
			obj.borderRadius <= 64
				? obj.borderRadius
				: factoryTheme.borderRadius;
		const restoredTheme = Theme.create({
			name: factoryTheme.name,
			background: factoryTheme.background,
			foreground: factoryTheme.foreground,
			fontFamily,
			fontSize: factoryTheme.fontSize,
			padding: factoryTheme.padding,
			borderRadius,
		});

		let snippet = Snippet.create({
			title: obj.title,
			code: obj.code,
			language: obj.language,
			theme: restoredTheme,
		});

		for (const step of obj.steps) {
			// Invalid focus strings remain cosmetic and degrade to no focus.
			const highlightRanges = step.focus ? (parseLineRanges(step.focus) ?? []) : [];
			snippet = snippet.addStep(
				Step.create({
					id: step.id,
					code: step.code,
					duration: step.duration,
					highlightRanges,
					annotation: step.caption,
				}),
			);
		}

		const background = obj.background;
		const windowChrome = obj.windowChrome ?? "macos";
		const showLineNumbers = obj.showLineNumbers ?? true;
		const lineNumberStart = obj.lineNumberStart ?? 1;
		const cardMargin = obj.cardMargin ?? DEFAULT_CARD_MARGIN;
		const framePadding = obj.framePadding ?? 24;
		const watermark = obj.watermark ?? "";

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
		// The export store owns aspect / tempo / typewriter / zoom / progress style:
		// apply those from the same snapshot so a JSON file, share link or template
		// restores them too. Runs BEFORE the baseline, so the settings the file
		// brought are part of the pristine state, not an edit.
		applyExportSettings(obj);
		markBaseline();

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
		markBaseline();

		get().rebuildPlan();
	},

	importSnippet: (code: string, meta?: { title?: string; language?: string }) => {
		// Thrown before any set(), so a blank paste leaves the studio intact.
		if (code.trim() === "") {
			throw new Error("Paste some code first.");
		}
		// Same bound as a project file: a 40,000-line paste froze the tab for
		// minutes, and the autosaved draft froze it again on every reload.
		assertImportableCode(code);
		const current = get().snippet;
		// Built from scratch rather than through rebuildSnippet, which carries the
		// existing steps over: dropping them is the entire point of an import.
		const rebuilt = Snippet.create({
			title: meta?.title ?? current.title,
			code,
			language: meta?.language ?? current.language,
			theme: current.theme,
			renderConfig: current.renderConfig,
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
		markBaseline();

		get().rebuildPlan();
	},
}));

/**
 * Re-baseline: from here on, "edited" means different from what the studio holds
 * right now. Called once at startup for the default snippet, and by every action
 * that replaces the whole project (JSON import, share link, template, diff).
 * Reads the state's own producer, so it can never disagree with what a save
 * would write.
 */
function markBaseline(): void {
	const content = contentOf(useSnippetStore.getState());
	useSnippetStore.setState({ baselineFingerprint: contentFingerprint(content) });
}

// The default studio is pristine by definition: baseline it as soon as it exists.
markBaseline();
