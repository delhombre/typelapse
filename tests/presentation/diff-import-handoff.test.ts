import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The URL importer knows a pull request when it sees one and cannot open one;
 * the diff dialog next to it can. This is the counter they hand it across, kept
 * to one fact so neither has to own the other's state.
 */
describe("diff import handoff", () => {
	beforeEach(() => {
		useDiffImportStore.setState({ pending: null });
	});

	it("starts with nothing waiting", () => {
		expect(useDiffImportStore.getState().pending).toBeNull();
	});

	it("holds the text handed to it", () => {
		useDiffImportStore.getState().handOff("https://github.com/oven-sh/bun/pull/14210");

		expect(useDiffImportStore.getState().pending).toBe("https://github.com/oven-sh/bun/pull/14210");
	});

	/** Taken means taken: a re-render must not reopen the dialog behind the user. */
	it("clears once taken", () => {
		useDiffImportStore.getState().handOff("https://github.com/vercel/next.js/pull/71102");
		useDiffImportStore.getState().take();

		expect(useDiffImportStore.getState().pending).toBeNull();
	});

	it("keeps only the most recent hand-off", () => {
		useDiffImportStore.getState().handOff("https://github.com/a/b/pull/1");
		useDiffImportStore.getState().handOff("https://github.com/a/b/pull/2");

		expect(useDiffImportStore.getState().pending).toBe("https://github.com/a/b/pull/2");
	});
});
