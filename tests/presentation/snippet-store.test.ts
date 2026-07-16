import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { beforeEach, describe, expect, it } from "vitest";

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
