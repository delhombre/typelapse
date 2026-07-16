import { HighlightRange } from "@/domain/value-objects/highlight-range";
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

		// Blank code is rejected at the source (Snippet.create), so a blank editor
		// can never produce a recorded step even while armed.
		expect(() => store.setCode("   ")).toThrow();
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
