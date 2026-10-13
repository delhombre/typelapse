import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { openStudioProjectDocument } from "@/presentation/utils/studio-project-replacement";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manyHunks } from "../support/many-hunks";

/**
 * A walkthrough past the step cap ends early on its own marker row; the import
 * says the same thing in words, once, through the notice store. Removing the
 * call from the hook must break this file.
 */

const chaptersOfThree = vi.hoisted(() => ({
	value: [] as Array<{ title: string; diffText: string }>,
}));

vi.mock("@/infrastructure/import/pr-import", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/infrastructure/import/pr-import")>()),
	fetchPrChapters: vi.fn(async () => ({ title: "Many commits", chapters: chaptersOfThree.value })),
}));

const SINGLE_FRAME = JSON.stringify({
	title: "Single frame",
	code: "const only = 1;",
	language: "typescript",
	themeName: "midnight",
});

const PR_URL = "https://github.com/octocat/Hello-World/pull/42";

const messages = () => useNoticeStore.getState().notices.map((notice) => notice.message);

beforeEach(() => {
	openStudioProjectDocument(SINGLE_FRAME);
	for (const notice of useNoticeStore.getState().notices) {
		useNoticeStore.getState().dismiss(notice.id);
	}
	chaptersOfThree.value = ["one", "two", "three"].map((title, index) => ({
		title,
		diffText: manyHunks(`file${index}.ts`, 6),
	}));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("the notice an import posts when the step cap cut it", () => {
	it("names the scenes a pasted diff plays", async () => {
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(manyHunks("big.ts", 45));
		});

		expect(messages()).toEqual(["Showing the first 16 of 48 scenes"]);
	});

	it("names the commits a chaptered pull request plays", async () => {
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(PR_URL, "commit");
		});

		expect(messages()).toEqual(["Showing the first 2 of 3 commits"]);
	});

	it("says nothing when everything plays", async () => {
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(manyHunks("small.ts", 3));
		});

		expect(messages()).toEqual([]);
	});
});
