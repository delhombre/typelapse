import type { ProjectPayload } from "@/application/project/project-payload";
import { useExportStore } from "@/presentation/stores/export.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	DRAFT_STORAGE_KEY,
	clearDraft,
	hasArrivalPayload,
	readDraft,
	restoreDraftOnBoot,
	shouldRestoreDraft,
	startDraftAutosave,
	writeDraft,
} from "@/presentation/utils/studio-draft";
import {
	RECOVERY_NOTICE,
	RECOVERY_STORAGE_KEY,
	readKeptProjects,
} from "@/presentation/utils/studio-recovery";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The studio must survive a refresh. The draft is written to localStorage as
 * the SAME payload a JSON export writes, restored through the same
 * `importFromJson` path, and it always loses to an arrival that carries its
 * own content: a user opening `#import=` or `#share=` asked for that, not for
 * whatever they left behind last time.
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

function currentPayloadJson(): string {
	return JSON.stringify(useSnippetStore.getState().toProjectPayload());
}

beforeEach(() => {
	clearDraft();
	window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
	useNoticeStore.setState({ notices: [] });
});

describe("shouldRestoreDraft", () => {
	const pristine = payload({ title: "pristine.ts" });
	const draft = payload({ title: "draft.ts" });

	it("restores a differing draft on a plain arrival", () => {
		expect(shouldRestoreDraft({ hash: "", draft, pristine })).toBe(true);
	});

	it("does nothing when no draft exists", () => {
		expect(shouldRestoreDraft({ hash: "", draft: null, pristine })).toBe(false);
	});

	it("lets a deep-link import win over the draft", () => {
		expect(shouldRestoreDraft({ hash: "#import=abc", draft, pristine })).toBe(false);
	});

	it("lets a share link win over the draft", () => {
		expect(shouldRestoreDraft({ hash: "#share=abc", draft, pristine })).toBe(false);
	});

	it("ignores a draft identical to the pristine default", () => {
		expect(shouldRestoreDraft({ hash: "", draft: pristine, pristine })).toBe(false);
	});

	it("ignores unrelated hashes", () => {
		expect(shouldRestoreDraft({ hash: "#section", draft, pristine })).toBe(true);
	});
});

describe("hasArrivalPayload", () => {
	it("recognises the two content-bearing hashes", () => {
		expect(hasArrivalPayload("#import=abc")).toBe(true);
		expect(hasArrivalPayload("#share=abc")).toBe(true);
	});

	it("stays quiet for everything else", () => {
		expect(hasArrivalPayload("")).toBe(false);
		expect(hasArrivalPayload("#anchor")).toBe(false);
	});
});

describe("draft storage", () => {
	it("round-trips through localStorage under the one key", () => {
		writeDraft('{"title":"kept"}');
		expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('{"title":"kept"}');
		expect(readDraft()).toBe('{"title":"kept"}');
	});

	it("clears without a trace", () => {
		writeDraft("{}");
		clearDraft();
		expect(readDraft()).toBeNull();
	});
});

describe("restoreDraftOnBoot", () => {
	it("restores a stored draft into the studio on a plain arrival", () => {
		writeDraft(payload({ title: "restored.ts", code: "const restored = 1;" }));

		expect(restoreDraftOnBoot("")).toBe(true);
		expect(useSnippetStore.getState().snippet.title).toBe("restored.ts");
		expect(useSnippetStore.getState().snippet.code).toBe("const restored = 1;");
	});

	it("counts the restored draft as loaded, not as unsaved edits", () => {
		writeDraft(payload({ title: "baselined.ts" }));
		restoreDraftOnBoot("");

		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
	});

	it("leaves the studio alone when the page arrives with an import intent", () => {
		const before = useSnippetStore.getState().snippet.title;
		writeDraft(payload({ title: "loser.ts" }));

		expect(restoreDraftOnBoot("#import=abc")).toBe(false);
		expect(useSnippetStore.getState().snippet.title).toBe(before);
	});

	it("leaves the studio alone when the page arrives with a share link", () => {
		const before = useSnippetStore.getState().snippet.title;
		writeDraft(payload({ title: "loser.ts" }));

		expect(restoreDraftOnBoot("#share=abc")).toBe(false);
		expect(useSnippetStore.getState().snippet.title).toBe(before);
	});

	it("skips a draft identical to what the studio already shows", () => {
		writeDraft(currentPayloadJson());
		expect(restoreDraftOnBoot("")).toBe(false);
	});

	it("sets a corrupt draft aside instead of wedging every boot", () => {
		writeDraft("{not json");
		const before = useSnippetStore.getState().snippet.title;

		expect(restoreDraftOnBoot("")).toBe(false);
		expect(readDraft()).toBeNull();
		expect(readKeptProjects().map((kept) => kept.draft)).toEqual(["{not json"]);
		expect(useSnippetStore.getState().snippet.title).toBe(before);
	});

	it("sets a parseable but invalid draft aside the same way, and says so", () => {
		writeDraft('{"title":""}');

		expect(restoreDraftOnBoot("")).toBe(false);
		expect(readDraft()).toBeNull();
		expect(readKeptProjects().map((kept) => kept.draft)).toEqual(['{"title":""}']);
		expect(useNoticeStore.getState().notices.map((notice) => notice.message)).toEqual([
			RECOVERY_NOTICE,
		]);
	});
});

describe("startDraftAutosave", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("persists an edit after the debounce window", () => {
		const autosave = startDraftAutosave();
		useSnippetStore.getState().setCode("const autosaved = 1;");

		expect(readDraft()).toBeNull();
		vi.advanceTimersByTime(1000);

		const draft = readDraft();
		expect(draft).not.toBeNull();
		expect(JSON.parse(draft as string).code).toBe("const autosaved = 1;");
		autosave.stop();
	});

	it("coalesces a burst of edits into one write", () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem");
		const autosave = startDraftAutosave();

		useSnippetStore.getState().setCode("const a = 1;");
		vi.advanceTimersByTime(300);
		useSnippetStore.getState().setCode("const a = 2;");
		vi.advanceTimersByTime(300);
		useSnippetStore.getState().setCode("const a = 3;");
		vi.advanceTimersByTime(1000);

		expect(setItem).toHaveBeenCalledTimes(1);
		expect(JSON.parse(readDraft() as string).code).toBe("const a = 3;");
		autosave.stop();
		setItem.mockRestore();
	});

	it("carries the export-store settings the payload already includes", () => {
		const autosave = startDraftAutosave();
		useExportStore.getState().setTypewriter(true);
		vi.advanceTimersByTime(1000);

		expect(JSON.parse(readDraft() as string).typewriter).toBe(true);
		useExportStore.getState().setTypewriter(false);
		vi.advanceTimersByTime(1000);
		autosave.stop();
	});

	it("skips the write when the payload has not actually changed", () => {
		const autosave = startDraftAutosave();
		useSnippetStore.getState().setCode("const same = 1;");
		vi.advanceTimersByTime(1000);

		const setItem = vi.spyOn(Storage.prototype, "setItem");
		// Playback position changes the store but not the project payload.
		useSnippetStore.getState().setCurrentStepIndex(0);
		vi.advanceTimersByTime(1000);

		expect(setItem).not.toHaveBeenCalled();
		autosave.stop();
		setItem.mockRestore();
	});

	it("still writes while playback re-arms the debounce every frame", () => {
		const autosave = startDraftAutosave();
		useSnippetStore.getState().setCode("const edited_then_played = 1;");

		// The playback loop sets the store on every animation frame. A plain
		// debounce would be pushed back sixty times a second and never fire.
		for (let frame = 0; frame < 300; frame += 1) {
			vi.advanceTimersByTime(16);
			useSnippetStore.getState().setCurrentStepIndex(0);
		}

		expect(JSON.parse(readDraft() as string).code).toBe("const edited_then_played = 1;");
		autosave.stop();
	});

	it("flushes the pending write on demand", () => {
		const autosave = startDraftAutosave();
		useSnippetStore.getState().setCode("const flushed = 1;");
		autosave.flush();

		expect(JSON.parse(readDraft() as string).code).toBe("const flushed = 1;");
		autosave.stop();
	});

	it("stops listening once stopped", () => {
		const autosave = startDraftAutosave();
		autosave.stop();

		useSnippetStore.getState().setCode("const unheard = 1;");
		vi.advanceTimersByTime(1000);

		expect(readDraft()).toBeNull();
	});
});
