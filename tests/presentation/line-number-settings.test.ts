import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { beforeEach, describe, expect, it } from "vitest";

const payload = (extra: Record<string, unknown>) =>
	JSON.stringify({
		title: "t",
		code: "const a = 1;",
		language: "typescript",
		themeName: "midnight",
		steps: [],
		...extra,
	});

describe("line-number settings", () => {
	beforeEach(() => {
		useSnippetStore.setState({ showLineNumbers: true, lineNumberStart: 1 });
	});

	it("clamps the start to a positive integer", () => {
		useSnippetStore.getState().setLineNumberStart(0);
		expect(useSnippetStore.getState().lineNumberStart).toBe(1);
		useSnippetStore.getState().setLineNumberStart(42.9);
		expect(useSnippetStore.getState().lineNumberStart).toBe(42);
	});

	it("round-trips through exportToJson", () => {
		useSnippetStore.getState().setShowLineNumbers(false);
		useSnippetStore.getState().setLineNumberStart(10);
		const data = JSON.parse(useSnippetStore.getState().exportToJson());
		expect(data.showLineNumbers).toBe(false);
		expect(data.lineNumberStart).toBe(10);
	});

	it("imports valid settings", () => {
		useSnippetStore
			.getState()
			.importFromJson(payload({ showLineNumbers: false, lineNumberStart: 7 }));
		expect(useSnippetStore.getState().showLineNumbers).toBe(false);
		expect(useSnippetStore.getState().lineNumberStart).toBe(7);
	});

	it("defaults missing settings to on / start 1", () => {
		useSnippetStore.getState().setShowLineNumbers(false);
		useSnippetStore.getState().setLineNumberStart(9);
		useSnippetStore.getState().importFromJson(payload({}));
		expect(useSnippetStore.getState().showLineNumbers).toBe(true);
		expect(useSnippetStore.getState().lineNumberStart).toBe(1);
	});

	it("rejects an invalid start on import", () => {
		useSnippetStore.getState().importFromJson(payload({ lineNumberStart: 0 }));
		expect(useSnippetStore.getState().lineNumberStart).toBe(1);
	});
});
