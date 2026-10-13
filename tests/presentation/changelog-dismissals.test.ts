import {
	type ChangelogEntry,
	latestEntries,
	undismissedEntries,
} from "@/application/changelog/entries";
import {
	CHANGELOG_DISMISSED_STORAGE_KEY,
	parseDismissedEntryIds,
	readDismissedEntryIds,
	writeDismissedEntryIds,
} from "@/presentation/utils/changelog-dismissals";
import { beforeEach, describe, expect, it, vi } from "vitest";

const entry = (id: string, date: string): ChangelogEntry => ({
	id,
	date,
	title: id,
	summary: `${id}.`,
});

/** A fresh store, as a reload builds it: it reads storage when it is created. */
async function freshStore() {
	vi.resetModules();
	return (await import("@/presentation/stores/changelog.store")).useChangelogStore;
}

beforeEach(() => window.localStorage.clear());

describe("the dismissed entry ids", () => {
	it("starts empty", () => {
		expect(readDismissedEntryIds().size).toBe(0);
		expect(parseDismissedEntryIds(null).size).toBe(0);
	});

	it("takes only the small versioned shape it owns", () => {
		expect([...parseDismissedEntryIds('{"version":1,"ids":["a","b"]}')]).toEqual(["a", "b"]);
		expect(parseDismissedEntryIds('{"ids":["a"]}').size).toBe(0);
		expect(parseDismissedEntryIds("nope").size).toBe(0);
		expect([...parseDismissedEntryIds('{"version":1,"ids":["a",3,null]}')]).toEqual(["a"]);
	});

	it("is kept under its own key, apart from the draft", () => {
		writeDismissedEntryIds(new Set(["a"]));
		expect(window.localStorage.getItem(CHANGELOG_DISMISSED_STORAGE_KEY)).toBe(
			'{"version":1,"ids":["a"]}',
		);
		expect(window.localStorage.getItem("typelapse:draft")).toBeNull();
	});

	it("survives a storage that throws", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		expect(readDismissedEntryIds().size).toBe(0);
		expect(() => writeDismissedEntryIds(new Set(["a"]))).not.toThrow();
		vi.restoreAllMocks();
	});
});

describe("dismissing What's new", () => {
	const entries = [entry("a", "2026-10-03"), entry("b", "2026-10-02"), entry("c", "2026-10-01")];

	it("stays dismissed across a reload", async () => {
		const first = await freshStore();
		expect(undismissedEntries(entries, first.getState().dismissed)).toHaveLength(3);
		first.getState().dismiss(entries.map((e) => e.id));

		const reloaded = await freshStore();
		expect(undismissedEntries(entries, reloaded.getState().dismissed)).toEqual([]);
	});

	it("shows a new entry after an old dismissal, with the older ones it sits among", async () => {
		const first = await freshStore();
		first.getState().dismiss(entries.map((e) => e.id));

		const reloaded = await freshStore();
		const shipped = [entry("d", "2026-10-09"), ...entries];
		const shown = latestEntries(shipped, 3);
		expect(shown.map((e) => e.id)).toEqual(["d", "a", "b"]);
		expect(undismissedEntries(shown, reloaded.getState().dismissed).map((e) => e.id)).toEqual([
			"d",
		]);
	});

	it("keeps earlier dismissals when it adds more", async () => {
		const store = await freshStore();
		store.getState().dismiss(["a"]);
		store.getState().dismiss(["b"]);
		expect([...readDismissedEntryIds()].sort()).toEqual(["a", "b"]);
	});
});
