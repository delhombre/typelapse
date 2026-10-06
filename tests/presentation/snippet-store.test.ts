import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import { Snippet } from "@/domain/entities/snippet";
import { MAX_ANNOTATION_LENGTH } from "@/domain/entities/step";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Step edits must preserve step identity: the card's React key, drag state and
 * any captured id all rely on `step.id` surviving duration/focus/caption edits.
 */

const BASE = JSON.stringify({
	title: "identity",
	code: "const a = 2;",
	language: "typescript",
	themeName: "midnight",
	steps: [
		{ code: "const a = 1;", duration: 1000 },
		{ code: "const a = 2;", duration: 1000 },
	],
});

describe("snippet store versioned import", () => {
	it("opens a code-only V2 document through the same strict import boundary", () => {
		const document = migrateV1ToV2(JSON.parse(BASE));

		useSnippetStore.getState().importFromJson(JSON.stringify(document));

		const snippet = useSnippetStore.getState().snippet;
		expect(snippet.title).toBe("identity");
		expect(snippet.steps.map((step) => step.code)).toEqual(["const a = 1;", "const a = 2;"]);
	});
});

describe("snippet store step edits", () => {
	beforeEach(() => {
		useSnippetStore.getState().importFromJson(BASE);
	});

	it("preserves the step id across duration, focus and caption edits", () => {
		const store = useSnippetStore.getState();
		const id = store.snippet.steps[0]?.id ?? "";

		store.updateStepDuration(id, 2500);
		store.updateStepFocus(id, [HighlightRange.create({ startLine: 1, endLine: 1 })]);
		store.updateStepAnnotation(id, "hello");

		const step = useSnippetStore.getState().snippet.steps[0];
		expect(step?.id).toBe(id);
	});

	it("applies sequential edits against the same captured id", () => {
		const store = useSnippetStore.getState();
		const id = store.snippet.steps[0]?.id ?? "";

		// Regression: the second call used to silently no-op because the first
		// edit replaced the step's id, so `findIndex` no longer matched.
		store.updateStepFocus(id, [HighlightRange.create({ startLine: 2, endLine: 3 })]);
		store.updateStepAnnotation(id, "focused then captioned");

		const step = useSnippetStore.getState().snippet.steps[0];
		expect(step?.annotation).toBe("focused then captioned");
		expect(step?.highlightRanges).toHaveLength(1);
		expect(step?.highlightRanges[0]).toMatchObject({ startLine: 2, endLine: 3 });
	});

	it("leaves untouched steps and step order intact", () => {
		const store = useSnippetStore.getState();
		const ids = store.snippet.steps.map((s) => s.id);

		store.updateStepAnnotation(ids[0] ?? "", "first");

		const after = useSnippetStore.getState().snippet.steps;
		expect(after.map((s) => s.id)).toEqual(ids);
		expect(after[1]?.annotation).toBeUndefined();
	});

	it("duplicates a scene beside its source and selects the copy", () => {
		const store = useSnippetStore.getState();
		const source = store.snippet.steps[0];
		if (!source) {
			throw new Error("The base project must contain a first scene");
		}

		store.duplicateStep(source.id);

		const after = useSnippetStore.getState();
		const copy = after.snippet.steps[1];
		expect(after.snippet.steps).toHaveLength(3);
		expect(copy?.id).not.toBe(source.id);
		expect(copy).toMatchObject({
			code: source.code,
			duration: source.duration,
			annotation: source.annotation,
		});
		expect(after.currentStepIndex).toBe(1);
	});

	it("keeps an exact paused playback frame while scrubbing through a morph", () => {
		useExportStore.getState().setTransitionMs(650);

		useSnippetStore.getState().seekPlayback(0.5);

		const after = useSnippetStore.getState();
		expect(after.isPlaying).toBe(false);
		expect(after.playbackProgress).toBeCloseTo(0.5);
		expect(after.playback).toMatchObject({ phase: "transition", index: 0, t: 0.5 });
		expect(after.currentStepIndex).toBe(1);
	});

	it("retains the paused frame until an explicit scene selection clears it", () => {
		useSnippetStore.getState().seekPlayback(0.5);
		const paused = useSnippetStore.getState().playback;

		useSnippetStore.getState().pause();
		expect(useSnippetStore.getState().playback).toEqual(paused);

		useSnippetStore.getState().setCurrentStepIndex(0);
		expect(useSnippetStore.getState().playback).toBeNull();
	});

	it("leaves an exact scrub frame when code editing resumes", () => {
		useSnippetStore.getState().seekPlayback(0.5);
		expect(useSnippetStore.getState().playback).not.toBeNull();

		useSnippetStore.getState().setCode("const a = 3;");

		expect(useSnippetStore.getState().playback).toBeNull();
	});
});

/**
 * Record mode: while armed, each pause in typing captures a step. A 1500 ms
 * debounce coalesces bursts, blank/unchanged code is ignored, and stopping
 * flushes the final edit and clears the pending timer.
 */
describe("snippet store record mode", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Clear any dangling record state, then start from a known 2-step snippet
		// whose live code equals the last step (so starting does not auto-capture).
		useSnippetStore.getState().stopRecording();
		useSnippetStore.getState().importFromJson(BASE);
	});

	afterEach(() => {
		useSnippetStore.getState().stopRecording();
		vi.useRealTimers();
	});

	function stepCount(): number {
		return useSnippetStore.getState().snippet.steps.length;
	}

	function lastCode(): string | undefined {
		const steps = useSnippetStore.getState().snippet.steps;
		return steps[steps.length - 1]?.code;
	}

	it("captures a baseline step when recording starts on fresh code", () => {
		const store = useSnippetStore.getState();
		// Edit before arming so the live code differs from the last step.
		store.setCode("const a = 3;");
		const before = stepCount();

		useSnippetStore.getState().startRecording();

		expect(stepCount()).toBe(before + 1);
		expect(lastCode()).toBe("const a = 3;");
		expect(useSnippetStore.getState().isRecording).toBe(true);
	});

	it("does not capture a baseline when the code matches the last step", () => {
		// BASE's live code already equals the last step ("const a = 2;").
		const before = stepCount();
		useSnippetStore.getState().startRecording();
		expect(stepCount()).toBe(before);
	});

	it("coalesces rapid edits into a single captured step after the pause", () => {
		const store = useSnippetStore.getState();
		store.startRecording();
		const before = stepCount();

		store.setCode("const a = 21;");
		store.setCode("const a = 22;");
		store.setCode("const a = 23;");
		// Nothing yet: the debounce is still pending.
		expect(stepCount()).toBe(before);

		vi.advanceTimersByTime(1500);

		expect(stepCount()).toBe(before + 1);
		expect(lastCode()).toBe("const a = 23;");
	});

	it("does not capture unchanged code, and blank code never becomes a step", () => {
		const store = useSnippetStore.getState();
		store.startRecording();
		const before = stepCount();

		// Unchanged relative to the last step → the pause fires but captures nothing.
		store.setCode("const a = 2;");
		vi.advanceTimersByTime(1500);
		expect(stepCount()).toBe(before);

		// A blank editor is a draft, not a snippet: it can never produce a recorded
		// step even while armed.
		store.setCode("   ");
		vi.advanceTimersByTime(1500);
		expect(stepCount()).toBe(before);
	});

	it("flushes a trailing step when recording stops before the pause fires", () => {
		const store = useSnippetStore.getState();
		store.startRecording();
		const before = stepCount();

		store.setCode("const a = 99;");
		useSnippetStore.getState().stopRecording();

		expect(stepCount()).toBe(before + 1);
		expect(lastCode()).toBe("const a = 99;");
		expect(useSnippetStore.getState().isRecording).toBe(false);
	});

	it("clears the pending debounce timer on stop", () => {
		const store = useSnippetStore.getState();
		store.startRecording();
		store.setCode("const a = 7;");
		expect(vi.getTimerCount()).toBeGreaterThan(0);

		useSnippetStore.getState().stopRecording();

		expect(vi.getTimerCount()).toBe(0);
	});
});

/**
 * A caption is cosmetic, so no import may die on one. Restoring a project (JSON
 * file or share link) authored under a looser bound must still load: the caption
 * shortens, the project survives. Typing one is the opposite case, bounded live.
 */
describe("snippet store caption bounds on import", () => {
	it("loads a project whose stored caption is longer than the bound", () => {
		const long = "a".repeat(MAX_ANNOTATION_LENGTH + 40);
		const json = JSON.stringify({
			title: "legacy",
			code: "const a = 1;",
			language: "typescript",
			themeName: "midnight",
			steps: [{ code: "const a = 1;", duration: 1000, caption: long }],
		});

		expect(() => useSnippetStore.getState().importFromJson(json)).not.toThrow();

		const { steps } = useSnippetStore.getState().snippet;
		expect(steps).toHaveLength(1);
		const caption = steps[0]?.annotation ?? "";
		expect(caption.length).toBeLessThanOrEqual(MAX_ANNOTATION_LENGTH);
		expect(caption.endsWith("…")).toBe(true);
	});

	it("still refuses an over-long caption typed into a step", () => {
		useSnippetStore.getState().importFromJson(BASE);
		const id = useSnippetStore.getState().snippet.steps[0]?.id ?? "";

		expect(() =>
			useSnippetStore.getState().updateStepAnnotation(id, "b".repeat(MAX_ANNOTATION_LENGTH + 1)),
		).toThrow();
	});
});

/**
 * importDiff: paste a unified diff, get an animated walkthrough. It replaces the
 * whole snippet (before-state code, inferred language, filename title, and a
 * step per hunk stage) and never mutates state when the paste is unusable.
 */
describe("snippet store importDiff", () => {
	const SINGLE_HUNK_DIFF = [
		"diff --git a/src/greet.ts b/src/greet.ts",
		"--- a/src/greet.ts",
		"+++ b/src/greet.ts",
		"@@ -1,3 +1,3 @@",
		" function greet(name) {",
		'-  return "Hello " + name;',
		"+  return `Hello, ${name}!`;",
		" }",
	].join("\n");

	beforeEach(() => {
		// Start from a known baseline so we can prove importDiff overwrites it.
		useSnippetStore.getState().importFromJson(BASE);
	});

	it("replaces steps with staged snapshots and sets title, language and before-code", () => {
		useSnippetStore.getState().importDiff(SINGLE_HUNK_DIFF);
		const { snippet, currentStepIndex, isPlaying } = useSnippetStore.getState();

		// One hunk → before + after = 2 steps.
		expect(snippet.steps).toHaveLength(2);
		expect(snippet.title).toBe("greet.ts");
		expect(snippet.language).toBe("typescript");
		// The snippet opens on the "before" state; step 0 matches it.
		expect(snippet.code).toBe(
			["function greet(name) {", '  return "Hello " + name;', "}"].join("\n"),
		);
		expect(snippet.steps[0]?.code).toBe(snippet.code);
		expect(snippet.steps[1]?.code).toBe(
			["function greet(name) {", "  return `Hello, ${name}!`;", "}"].join("\n"),
		);
		expect(currentStepIndex).toBe(0);
		expect(isPlaying).toBe(false);
	});

	it("stages one step per hunk for a multi-hunk diff", () => {
		const twoHunk = [
			"--- a/app.ts",
			"+++ b/app.ts",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 20;",
			"@@ -10,2 +10,3 @@",
			" const c = 3;",
			"+const d = 4;",
			" const e = 5;",
		].join("\n");

		useSnippetStore.getState().importDiff(twoHunk);
		// 2 hunks → before, after-hunk-1, after-hunk-2 = 3 steps.
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(3);
	});

	it("carries each snapshot's label onto its step as the caption", () => {
		const twoHunk = [
			"--- a/app.ts",
			"+++ b/app.ts",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 20;",
			"@@ -10,2 +10,3 @@",
			" const c = 3;",
			"+const d = 4;",
			" const e = 5;",
		].join("\n");

		useSnippetStore.getState().importDiff(twoHunk);
		const { steps } = useSnippetStore.getState().snippet;

		// Snapshot labels narrate the walkthrough: before → the changed hunk → after.
		expect(steps.map((s) => s.annotation)).toEqual(["Before", "Change 1", "After"]);
	});

	it("keeps each kept step's own label when the MAX cap trims a huge diff", () => {
		// 45 single-line hunks → 46 stages; the store caps diff steps at 40, keeping
		// the first 39 stages plus the final "after". Each kept step must retain the
		// label of ITS OWN snapshot: the trim must not shift captions.
		const HUNKS = 45;
		const lines = ["--- a/big.ts", "+++ b/big.ts"];
		for (let k = 1; k <= HUNKS; k++) {
			lines.push(`@@ -${k},1 +${k},1 @@`);
			lines.push(`-const v${k} = ${k};`);
			lines.push(`+const v${k} = ${k * 10};`);
		}

		useSnippetStore.getState().importDiff(lines.join("\n"));
		const { steps } = useSnippetStore.getState().snippet;

		expect(steps).toHaveLength(40);
		expect(steps[0]?.annotation).toBe("Before");
		// The last kept stage keeps its own "After" label, not the trimmed neighbour's.
		expect(steps[39]?.annotation).toBe("After");
		// A kept middle stage keeps its own "Change N" label (index unshifted).
		expect(steps[38]?.annotation).toBe("Change 38");
	});

	it("survives a hunk heading longer than the caption bound", () => {
		// git prints the enclosing section after the second `@@`, and real signatures
		// blow past the caption bound easily. That heading is GENERATED, not typed, so
		// it must never take the whole import down with it: the boundary shortens it.
		const longHeading =
			"export async function reconcileWorkspaceMembershipInvitations(organizationId: string, actorId: string)";
		expect(longHeading.length).toBeGreaterThan(MAX_ANNOTATION_LENGTH);

		const diff = [
			"--- a/app.ts",
			"+++ b/app.ts",
			`@@ -1,2 +1,2 @@ ${longHeading}`,
			" const a = 1;",
			"-const b = 2;",
			"+const b = 20;",
			"@@ -10,2 +10,3 @@",
			" const c = 3;",
			"+const d = 4;",
			" const e = 5;",
		].join("\n");

		expect(() => useSnippetStore.getState().importDiff(diff)).not.toThrow();

		const { steps } = useSnippetStore.getState().snippet;
		expect(steps).toHaveLength(3);
		// The caption survives, shortened to the bound and ellipsised so the cut is legible.
		const caption = steps[1]?.annotation ?? "";
		expect(caption.length).toBeLessThanOrEqual(MAX_ANNOTATION_LENGTH);
		expect(caption.endsWith("…")).toBe(true);
		expect(longHeading.startsWith(caption.slice(0, -1))).toBe(true);
	});

	it("infers a non-default language and drops a new file's empty before frame", () => {
		const pyDiff = [
			"diff --git a/greeter.py b/greeter.py",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/greeter.py",
			"@@ -0,0 +1,2 @@",
			"+def greet(name):",
			'+    return f"Hello, {name}!"',
		].join("\n");

		useSnippetStore.getState().importDiff(pyDiff);
		const { snippet } = useSnippetStore.getState();

		// Inferred from the .py path: proves it overrode the baseline's typescript.
		expect(snippet.language).toBe("python");
		expect(snippet.title).toBe("greeter.py");
		expect(snippet.steps.every((s) => s.code.trim().length > 0)).toBe(true);
		expect(snippet.code).toBe(["def greet(name):", '    return f"Hello, {name}!"'].join("\n"));
	});

	it("throws on an unusable diff without mutating state", () => {
		const before = useSnippetStore.getState().snippet;

		expect(() => useSnippetStore.getState().importDiff("")).toThrow();
		expect(() => useSnippetStore.getState().importDiff("just some prose, not a diff")).toThrow();

		// Same snippet instance → nothing was set.
		const after = useSnippetStore.getState().snippet;
		expect(after).toBe(before);
		expect(after.steps).toHaveLength(2);
	});
});

/**
 * importChapters: a PR's commits become one walkthrough, each commit a chapter
 * played in order. It reuses importDiff's staging (same MAX cap and captions),
 * heads each chapter's first step "k/N · subject", and never mutates state when
 * no chapter carries changes.
 */
describe("snippet store importChapters", () => {
	const edit = (path: string, from: string, to: string) =>
		[
			`--- a/${path}`,
			`+++ b/${path}`,
			"@@ -1,3 +1,3 @@",
			" const head = 0;",
			`-${from}`,
			`+${to}`,
			" const tail = 9;",
		].join("\n");

	beforeEach(() => {
		useSnippetStore.getState().importFromJson(BASE);
	});

	it("chapters the commits in order, heading each with k/N and setting the PR title", () => {
		useSnippetStore.getState().importChapters(
			[
				{ title: "add alpha", diffText: edit("a.ts", "const x = 1;", "const x = 2;") },
				{ title: "add beta", diffText: edit("b.ts", "const y = 1;", "const y = 2;") },
			],
			{ title: "My pull request" },
		);
		const { snippet, currentStepIndex, isPlaying } = useSnippetStore.getState();

		expect(snippet.title).toBe("My pull request");
		// Chapter 1 keeps its before + after; chapter 2 drops its redundant before.
		expect(snippet.steps.map((s) => s.annotation)).toEqual([
			"1/2 · add alpha",
			"After",
			"2/2 · add beta",
		]);
		// Opens on chapter 1's before-state.
		expect(snippet.code).toBe(["const head = 0;", "const x = 1;", "const tail = 9;"].join("\n"));
		expect(snippet.steps[0]?.code).toBe(snippet.code);
		expect(currentStepIndex).toBe(0);
		expect(isPlaying).toBe(false);
	});

	it("caps chaptered steps at MAX_DIFF_STEPS, keeping the final after-frame", () => {
		// Two chapters of 25 single-line hunks each: 26 + 25 = 51 stages after the
		// second chapter's redundant before is dropped. The store caps at 40, keeping
		// the first 39 plus the final after so the walkthrough still ends complete.
		const bigDiff = (path: string) => {
			const lines = [`--- a/${path}`, `+++ b/${path}`];
			for (let k = 1; k <= 25; k++) {
				lines.push(`@@ -${k},1 +${k},1 @@`);
				lines.push(`-const v${k} = ${k};`);
				lines.push(`+const v${k} = ${k * 10};`);
			}
			return lines.join("\n");
		};

		useSnippetStore.getState().importChapters(
			[
				{ title: "first half", diffText: bigDiff("one.ts") },
				{ title: "second half", diffText: bigDiff("two.ts") },
			],
			{ title: "big pr" },
		);
		const { steps } = useSnippetStore.getState().snippet;

		expect(steps).toHaveLength(40);
		// The final kept step is chapter 2's after-frame, with its own "After" label.
		expect(steps[39]?.annotation).toBe("After");
		expect(steps[39]?.code).toContain("const v25 = 250;");
	});

	it("infers a non-default language from the chapters", () => {
		useSnippetStore
			.getState()
			.importChapters(
				[{ title: "python change", diffText: edit("greeter.py", "y = 1", "y = 2") }],
				{ title: "py pr" },
			);
		// Overrode the baseline's typescript from the .py chapter path.
		expect(useSnippetStore.getState().snippet.language).toBe("python");
	});

	it("throws without mutating state when every chapter is lockfiles-only or empty", () => {
		const lockOnly = [
			"--- a/pnpm-lock.yaml",
			"+++ b/pnpm-lock.yaml",
			"@@ -1,2 +1,2 @@",
			"-lockfileVersion: '6.0'",
			"+lockfileVersion: '9.0'",
			" settings:",
		].join("\n");
		const before = useSnippetStore.getState().snippet;

		expect(() =>
			useSnippetStore.getState().importChapters(
				[
					{ title: "bump deps", diffText: lockOnly },
					{ title: "nothing", diffText: "" },
				],
				{ title: "noop pr" },
			),
		).toThrow();

		// Same snippet instance → nothing was set.
		const after = useSnippetStore.getState().snippet;
		expect(after).toBe(before);
		expect(after.steps).toHaveLength(2);
	});
});

/**
 * A snippet always has code (the domain says so), but the editor is allowed to
 * be empty on the way to the next thing typed. The store holds that emptiness
 * as a draft beside the snippet instead of letting it reach Snippet.create:
 * #168, decision D2 of the verify gate's findings.
 */
describe("snippet store: an emptied editor is a draft", () => {
	const LIVE = "const a = 1;";
	const NO_STEPS = JSON.stringify({
		title: "draft",
		code: LIVE,
		language: "typescript",
		themeName: "midnight",
		steps: [],
	});

	beforeEach(() => {
		vi.useFakeTimers();
		useSnippetStore.getState().stopRecording();
		useSnippetStore.getState().importFromJson(NO_STEPS);
	});

	afterEach(() => {
		useSnippetStore.getState().stopRecording();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	const state = () => useSnippetStore.getState();

	it("takes an empty value without throwing, and the snippet keeps its code", () => {
		expect(() => state().setCode("")).not.toThrow();

		expect(state().draft).toBe("");
		expect(state().snippet.code).toBe(LIVE);
	});

	it("treats whitespace alone as empty, exactly as Snippet does", () => {
		state().setCode("  \n\t ");

		expect(state().draft).toBe("  \n\t ");
		expect(state().snippet.code).toBe(LIVE);
	});

	it("never reaches Snippet.create while the draft is empty", () => {
		const create = vi.spyOn(Snippet, "create");

		state().setCode("");
		state().setCode("   ");

		expect(create).not.toHaveBeenCalled();
	});

	it("resumes exactly as before when something is typed again", () => {
		state().setCode("");

		state().setCode("const b = 2;");

		expect(state().draft).toBeNull();
		expect(state().snippet.code).toBe("const b = 2;");
	});

	it("shows an empty card, not the previous code, while the draft is empty", () => {
		state().setCode("");

		const plan = state().plan;
		expect(plan?.frames).toHaveLength(1);
		expect(plan?.frames[0]?.tokens).toEqual([]);
		expect(state().isBuilding).toBe(false);
	});

	it("keeps the scenes' own plan when scenes exist: the live code is not on screen", () => {
		useSnippetStore.getState().importFromJson(BASE);
		const before = state().plan;

		state().setCode("");

		expect(state().plan).toBe(before);
		expect(state().snippet.steps).toHaveLength(2);
	});

	it("captures nothing while the draft is empty, whoever asks", () => {
		state().setCode("");

		state().captureStep();

		expect(state().snippet.steps).toHaveLength(0);
	});

	it("captures again once code is back", () => {
		state().setCode("");
		state().setCode("const c = 3;");

		state().captureStep();

		expect(state().snippet.steps.map((step) => step.code)).toEqual(["const c = 3;"]);
	});

	it("is cleared by anything that replaces the whole snippet", () => {
		state().setCode("");
		state().importSnippet("const d = 4;");
		expect(state().draft).toBeNull();

		state().setCode("");
		state().importFromJson(NO_STEPS);
		expect(state().draft).toBeNull();
	});

	describe("while recording", () => {
		it("anchors no baseline on an empty draft", () => {
			state().setCode("");

			state().startRecording();

			expect(state().snippet.steps).toHaveLength(0);
			expect(state().isRecording).toBe(true);
		});

		it("does not capture the previous code at the pause after emptying", () => {
			state().startRecording();
			const afterBaseline = state().snippet.steps.length;

			state().setCode("");
			vi.advanceTimersByTime(1500);

			expect(state().snippet.steps).toHaveLength(afterBaseline);
		});

		it("does not flush the previous code when recording stops on an empty draft", () => {
			state().startRecording();
			const afterBaseline = state().snippet.steps.length;
			state().setCode("");

			state().stopRecording();

			expect(state().snippet.steps).toHaveLength(afterBaseline);
		});

		it("resumes the debounce when typing starts again", () => {
			state().startRecording();
			state().setCode("");

			state().setCode("const e = 5;");
			vi.advanceTimersByTime(1500);

			expect(state().snippet.steps.at(-1)?.code).toBe("const e = 5;");
		});
	});
});

describe("snippet store: a blank title is not an error", () => {
	beforeEach(() => {
		useSnippetStore.getState().importFromJson(BASE);
	});

	it("falls back to Untitled for an empty or spaces-only name, and throws nothing", () => {
		expect(() => useSnippetStore.getState().setTitle("")).not.toThrow();
		expect(useSnippetStore.getState().snippet.title).toBe("Untitled");

		useSnippetStore.getState().setTitle("Named");
		expect(() => useSnippetStore.getState().setTitle("   ")).not.toThrow();
		expect(useSnippetStore.getState().snippet.title).toBe("Untitled");
	});

	it("keeps a real name as typed", () => {
		useSnippetStore.getState().setTitle("Trim the name");
		expect(useSnippetStore.getState().snippet.title).toBe("Trim the name");
	});
});
