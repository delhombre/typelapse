import type { ProjectPayload } from "@/application/project/project-payload";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { clearDraft, readDraft, writeDraft } from "@/presentation/utils/studio-draft";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The component that makes the studio survive: restores the draft on mount
 * (unless the arrival carries its own content), autosaves as you work, and
 * holds the door on unload while there are unsaved edits.
 */

function payload(overrides: Partial<ProjectPayload>): string {
	const base: ProjectPayload = {
		title: "draft.ts",
		code: "const draft = 1;",
		language: "typescript",
		themeName: "nord",
		background: "mesh:ocean",
		steps: [],
	};
	return JSON.stringify({ ...base, ...overrides });
}

beforeEach(() => {
	clearDraft();
	window.location.hash = "";
});

afterEach(() => {
	cleanup();
	window.location.hash = "";
});

describe("StudioPersistence", () => {
	it("restores the stored draft when the studio opens plain", () => {
		writeDraft(payload({ title: "restored.ts", code: "const restored = 1;" }));

		render(<StudioPersistence />);

		expect(useSnippetStore.getState().snippet.title).toBe("restored.ts");
	});

	it("cedes to a deep-link import: the user asked for what they pasted", () => {
		const before = useSnippetStore.getState().snippet.title;
		window.location.hash = "#import=abc";
		writeDraft(payload({ title: "loser.ts" }));

		render(<StudioPersistence />);

		expect(useSnippetStore.getState().snippet.title).toBe(before);
	});

	it("blocks unload while the studio holds unsaved edits, flushing the draft first", () => {
		render(<StudioPersistence />);
		useSnippetStore.getState().setCode("const dirty = 1;");

		const event = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		// The guard flushed the pending debounce: the draft is already current.
		expect(JSON.parse(readDraft() as string).code).toBe("const dirty = 1;");
	});

	it("lets a clean studio unload silently", () => {
		render(<StudioPersistence />);
		// Re-baseline: loading the studio's own payload counts as a load, not an edit.
		const store = useSnippetStore.getState();
		store.importFromJson(JSON.stringify(store.toProjectPayload()));

		const event = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});
});
