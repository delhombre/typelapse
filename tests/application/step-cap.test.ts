import { MAX_DIFF_STEPS, capWalkthrough, commitsShownNotice } from "@/application/diff/step-cap";
import { describe, expect, it } from "vitest";

/** A chapter of `size` frames, each carrying a unique body so a lost one is visible. */
function chapter(index: number, size: number) {
	return Array.from({ length: size }, (_, step) => ({
		code: `c${index}s${step}`,
		label: step === 0 ? `${index + 1}/6 · commit ${index + 1}` : `Change ${step}`,
	}));
}

describe("capWalkthrough", () => {
	it("leaves a walkthrough under the cap exactly as it came", () => {
		const sequences = [chapter(0, 10), chapter(1, 12)];

		const cut = capWalkthrough(sequences);

		expect(cut.snapshots).toEqual(sequences.flat());
		expect(cut.shownChapters).toBe(2);
		expect(cut.totalChapters).toBe(2);
		expect(cut.omittedSteps).toBe(0);
	});

	it("keeps the first whole chapters, drops the tail, and marks the last kept step", () => {
		// 60 steps in 6 chapters of 10: four fit (40), two do not.
		const sequences = Array.from({ length: 6 }, (_, index) => chapter(index, 10));

		const cut = capWalkthrough(sequences);

		expect(cut.snapshots).toHaveLength(MAX_DIFF_STEPS);
		expect(cut.shownChapters).toBe(4);
		expect(cut.totalChapters).toBe(6);
		expect(cut.omittedSteps).toBe(20);
		// Everything before the last kept step is untouched, nothing in the middle is lost.
		expect(cut.snapshots.slice(0, -1)).toEqual(sequences.slice(0, 4).flat().slice(0, -1));
		const last = cut.snapshots.at(-1);
		expect(last?.code).toBe("c3s9\n⋯ 20 more changes");
		expect(last?.label).toBe("Change 9");
	});

	it("drops a whole chapter that would straddle the cap, never half of it", () => {
		const sequences = [chapter(0, 25), chapter(1, 25), chapter(2, 5)];

		const cut = capWalkthrough(sequences);

		// The second chapter would reach 50: it goes whole, and so does the small one after it.
		expect(cut.snapshots).toHaveLength(25);
		expect(cut.shownChapters).toBe(1);
		expect(cut.omittedSteps).toBe(30);
		expect(cut.snapshots.at(-1)?.code).toBe("c0s24\n⋯ 30 more changes");
	});

	it("cuts inside the first chapter when it alone is past the cap", () => {
		const cut = capWalkthrough([chapter(0, 48)]);

		expect(cut.snapshots).toHaveLength(MAX_DIFF_STEPS);
		expect(cut.snapshots.slice(0, -1)).toEqual(chapter(0, 48).slice(0, MAX_DIFF_STEPS - 1));
		expect(cut.snapshots.at(-1)?.code).toBe("c0s39\n⋯ 8 more changes");
		expect(cut.shownChapters).toBe(1);
		expect(cut.totalChapters).toBe(1);
	});

	it("says 'change' for a single omitted step", () => {
		const cut = capWalkthrough([chapter(0, MAX_DIFF_STEPS + 1)]);

		expect(cut.snapshots.at(-1)?.code).toBe(`c0s${MAX_DIFF_STEPS - 1}\n⋯ 1 more change`);
	});

	it("shares the budget's own marker row instead of stacking a second one under it", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({
			code: "tail\n⋯ 4 more files",
			label: "After",
		});

		const cut = capWalkthrough([kept, chapter(1, 5)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯ 4 more files, 5 more changes");
	});

	it("lets the count replace the generic hidden-changes marker", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({
			code: "tail\n⋯ more changes hidden",
			label: "After",
		});

		const cut = capWalkthrough([kept, chapter(1, 3)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯ 3 more changes");
	});

	it("does not take a trailing separator for a marker", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({ code: "tail\n⋯", label: "After" });

		const cut = capWalkthrough([kept, chapter(1, 3)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯\n⋯ 3 more changes");
	});

	it("takes no chapters at all as nothing", () => {
		const cut = capWalkthrough([]);

		expect(cut.snapshots).toEqual([]);
		expect(cut.totalChapters).toBe(0);
	});
});

describe("commitsShownNotice", () => {
	it("names how many commits the video starts with when some were cut", () => {
		expect(commitsShownNotice(4, 6)).toBe("Showing the first 4 of 6 commits");
	});

	it("is silent when every commit fits, and for a single change", () => {
		expect(commitsShownNotice(6, 6)).toBeNull();
		expect(commitsShownNotice(1, 1)).toBeNull();
	});
});
