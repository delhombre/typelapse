import {
	CHANGELOG_ENTRIES,
	type ChangelogEntry,
	WHATS_NEW_COUNT,
	latestEntries,
	undismissedEntries,
} from "@/application/changelog/entries";
import { describe, expect, it } from "vitest";

const entry = (id: string, date: string): ChangelogEntry => ({
	id,
	date,
	title: `Title ${id}`,
	summary: `Summary ${id}.`,
});

describe("latestEntries", () => {
	it("keeps the newest n, newest first, whatever order they were written in", () => {
		const entries = [
			entry("a", "2026-10-01"),
			entry("d", "2026-10-09"),
			entry("b", "2026-10-03"),
			entry("c", "2026-10-05"),
		];
		expect(latestEntries(entries, 3).map((e) => e.id)).toEqual(["d", "c", "b"]);
	});

	it("keeps the written order within a day", () => {
		const entries = [entry("x", "2026-10-13"), entry("y", "2026-10-13"), entry("z", "2026-10-12")];
		expect(latestEntries(entries, 3).map((e) => e.id)).toEqual(["x", "y", "z"]);
	});

	it("returns what there is when there are fewer than n, and nothing for n of 0", () => {
		expect(latestEntries([entry("a", "2026-10-01")], 3)).toHaveLength(1);
		expect(latestEntries([], 3)).toEqual([]);
		expect(latestEntries([entry("a", "2026-10-01")], 0)).toEqual([]);
	});

	it("does not reorder the list it was given", () => {
		const entries = [entry("a", "2026-10-01"), entry("b", "2026-10-09")];
		latestEntries(entries, 2);
		expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
	});
});

describe("undismissedEntries", () => {
	const shown = [entry("a", "2026-10-03"), entry("b", "2026-10-02")];

	it("is every entry for a person who has dismissed nothing", () => {
		expect(undismissedEntries(shown, new Set())).toEqual(shown);
	});

	it("is none once each shown entry is dismissed", () => {
		expect(undismissedEntries(shown, new Set(["a", "b"]))).toEqual([]);
	});

	it("brings back a new entry after an old dismissal", () => {
		const dismissed = new Set(["a", "b"]);
		const later = latestEntries([entry("c", "2026-10-09"), ...shown], WHATS_NEW_COUNT);
		expect(undismissedEntries(later, dismissed).map((e) => e.id)).toEqual(["c"]);
	});
});

describe("the changelog data", () => {
	it("has unique ids, valid dates, one-line titles and one-sentence summaries", () => {
		const ids = CHANGELOG_ENTRIES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const e of CHANGELOG_ENTRIES) {
			expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(Number.isNaN(Date.parse(e.date))).toBe(false);
			expect(e.title).not.toMatch(/\n/);
			expect(e.summary.endsWith(".")).toBe(true);
			expect(`${e.title} ${e.summary}`).not.toMatch(/[–—]/);
		}
	});

	it("is written newest first", () => {
		const dates = CHANGELOG_ENTRIES.map((e) => e.date);
		expect(dates).toEqual([...dates].sort().reverse());
	});
});
