import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { beforeEach, describe, expect, it } from "vitest";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-const a = 1
+const a = 2
 const b = 3
`;

describe("importSnippet", () => {
	beforeEach(() => {
		useSnippetStore.setState({
			snippet: useSnippetStore.getState().snippet,
		});
	});

	it("replaces the code", () => {
		useSnippetStore.getState().importSnippet("const x = 1");
		expect(useSnippetStore.getState().snippet.code).toBe("const x = 1");
	});

	it("drops the steps a previous import left behind", () => {
		// Without this, effectiveCodes() keeps animating the old steps and the
		// pasted code is never seen: the paste would silently do nothing.
		useSnippetStore.getState().importDiff(DIFF);
		expect(useSnippetStore.getState().snippet.steps.length).toBeGreaterThan(0);

		useSnippetStore.getState().importSnippet("const x = 1");
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(0);
		expect(useSnippetStore.getState().snippet.code).toBe("const x = 1");
	});

	it("applies a title and language when given them", () => {
		useSnippetStore.getState().importSnippet("print('hi')", {
			title: "hello.py",
			language: "python",
		});
		const { snippet } = useSnippetStore.getState();
		expect(snippet.title).toBe("hello.py");
		expect(snippet.language).toBe("python");
	});

	it("keeps the current language when none is given", () => {
		useSnippetStore.getState().importSnippet("print('hi')", { language: "python" });
		useSnippetStore.getState().importSnippet("const x = 1");
		expect(useSnippetStore.getState().snippet.language).toBe("python");
	});

	it("resets playback position", () => {
		useSnippetStore.getState().importDiff(DIFF);
		useSnippetStore.getState().setCurrentStepIndex(1);
		useSnippetStore.getState().importSnippet("const x = 1");
		expect(useSnippetStore.getState().currentStepIndex).toBe(0);
		expect(useSnippetStore.getState().isPlaying).toBe(false);
	});

	it("rejects blank code before touching the snippet", () => {
		useSnippetStore.getState().importSnippet("const kept = 1");
		expect(() => useSnippetStore.getState().importSnippet("   \n ")).toThrow();
		expect(useSnippetStore.getState().snippet.code).toBe("const kept = 1");
	});
});
