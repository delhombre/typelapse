import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	clearDraft,
	hasArrivalPayload,
	readDraft,
	restoreDraftOnBoot,
	startDraftAutosave,
} from "@/presentation/utils/studio-draft";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * What a draft has to survive.
 *
 * Both cases here lost real work in a way the visitor could not see happening:
 * one wrote emptiness over the draft, the other wrote defaults over the theme.
 */

const payload = () => JSON.stringify(useSnippetStore.getState().toProjectPayload());

function freshStudio() {
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	useExportStore.setState(useExportStore.getInitialState(), true);
}

beforeEach(() => {
	clearDraft();
	freshStudio();
});

describe("an arrival that promises content and delivers none", () => {
	it("still answers yes to a bare prefix, which is why the flush had to be guarded", () => {
		// The reason the hole existed: the hash is inspected, never decoded, so a
		// truncated or corrupt link looks exactly like a good one at this stage.
		expect(hasArrivalPayload("#share=")).toBe(true);
		expect(hasArrivalPayload("#import=%%%not-base64%%%")).toBe(true);
	});

	it("leaves the draft intact when the studio never left its pristine state", () => {
		// Last session's work.
		useSnippetStore.getState().setTitle("Yesterday's project");
		const saved = payload();
		const autosave = startDraftAutosave(JSON.stringify(useSnippetStore.getInitialState().snippet));
		autosave.flush();
		autosave.stop();
		expect(readDraft()).not.toBeNull();
		const draftBefore = readDraft();

		// A new visit on a malformed `#share=`: the restore is skipped because the
		// hash claims an arrival, and the arrival then fails to load anything.
		freshStudio();
		const pristine = payload();
		expect(restoreDraftOnBoot("#share=%%%broken%%%")).toBe(false);

		// Leaving the studio flushes. It must not flush an empty studio over that.
		const second = startDraftAutosave(pristine);
		second.flush();
		second.stop();

		expect(readDraft()).toBe(draftBefore);
		expect(readDraft()).toContain("Yesterday's project");
		expect(saved).toContain("Yesterday's project");
	});

	it("writes again the moment the studio stops being pristine", () => {
		const pristine = payload();
		const autosave = startDraftAutosave(pristine);
		autosave.flush();
		expect(readDraft()).toBeNull();

		useSnippetStore.getState().setTitle("A real edit");
		autosave.flush();
		autosave.stop();
		expect(readDraft()).toContain("A real edit");
	});
});

describe("restoring a draft", () => {
	it("brings back the font and the radius the visitor chose", () => {
		// `importFromJson` rebuilds the theme from `themeName` alone — the file
		// format's own decision, left alone — so the draft path has to put these
		// two back or the next autosave writes the defaults over them for good.
		useSnippetStore.getState().setFont("Fira Code, monospace");
		useSnippetStore.getState().setBorderRadius(24);
		useSnippetStore.getState().setTitle("Themed");
		const draft = payload();
		const autosave = startDraftAutosave(JSON.stringify(useSnippetStore.getInitialState().snippet));
		autosave.flush();
		autosave.stop();

		freshStudio();
		expect(useSnippetStore.getState().snippet.theme.fontFamily).not.toContain("Fira Code");
		expect(useSnippetStore.getState().snippet.theme.borderRadius).not.toBe(24);

		expect(restoreDraftOnBoot("")).toBe(true);

		expect(useSnippetStore.getState().snippet.theme.fontFamily).toContain("Fira Code");
		expect(useSnippetStore.getState().snippet.theme.borderRadius).toBe(24);
		expect(useSnippetStore.getState().snippet.title).toBe("Themed");
		expect(draft).toContain("Fira Code");
	});

	it("survives a draft that names no font or radius at all", () => {
		useSnippetStore.getState().setTitle("Old format");
		const bare = JSON.parse(payload());
		bare.fontFamily = undefined;
		bare.borderRadius = undefined;
		localStorage.setItem("typelapse:draft", JSON.stringify(bare));

		freshStudio();
		expect(() => restoreDraftOnBoot("")).not.toThrow();
		expect(useSnippetStore.getState().snippet.title).toBe("Old format");
	});
});
