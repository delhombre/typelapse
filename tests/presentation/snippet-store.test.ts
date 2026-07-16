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
		// Nothing yet — the debounce is still pending.
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
