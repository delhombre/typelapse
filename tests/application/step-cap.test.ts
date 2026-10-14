import { MAX_DIFF_STEPS, capWalkthrough, cutNotice, stepBudget } from "@/application/diff/step-cap";
import { describe, expect, it } from "vitest";

/** A chapter of `size` frames, each carrying a unique body so a lost one is visible. */
function chapter(index: number, size: number) {
	return Array.from({ length: size }, (_, step) => ({
		code: `c${index}s${step}`,
		label: step === 0 ? `${index + 1}/6 · commit ${index + 1}` : `Change ${step}`,
	}));
}

describe("MAX_DIFF_STEPS", () => {
	it("is a duration budget: n steps run 1.85 n - 0.65 s, kept under 30 s", () => {
		expect(1.85 * MAX_DIFF_STEPS - 0.65).toBeLessThan(30);
		expect(1.85 * (MAX_DIFF_STEPS + 1) - 0.65).toBeGreaterThanOrEqual(30);
	});
});

describe("stepBudget", () => {
	it("counts a title card as one of the steps, since the ceiling is a duration", () => {
		expect(stepBudget(false)).toBe(MAX_DIFF_STEPS);
		expect(stepBudget(true)).toBe(MAX_DIFF_STEPS - 1);
	});
});

describe("capWalkthrough", () => {
	it("leaves a walkthrough under the cap exactly as it came", () => {
		const sequences = [chapter(0, 7), chapter(1, 9)];

		const cut = capWalkthrough(sequences);

		expect(cut.snapshots).toEqual(sequences.flat());
		expect(cut.shownChapters).toBe(2);
		expect(cut.totalChapters).toBe(2);
		expect(cut.omittedSteps).toBe(0);
		expect(cut.cutWithinChapter).toBe(false);
	});

	it("keeps the first whole chapters, drops the tail, and marks the last kept step", () => {
		// 60 steps in 6 chapters of 10: only one fits under 16, the rest go whole.
		const sequences = Array.from({ length: 6 }, (_, index) => chapter(index, 10));

		const cut = capWalkthrough(sequences);

		expect(cut.snapshots).toHaveLength(10);
		expect(cut.shownChapters).toBe(1);
		expect(cut.totalChapters).toBe(6);
		expect(cut.omittedSteps).toBe(50);
		expect(cut.cutWithinChapter).toBe(false);
		// Everything before the last kept step is untouched, nothing in the middle is lost.
		expect(cut.snapshots.slice(0, -1)).toEqual(chapter(0, 10).slice(0, -1));
		const last = cut.snapshots.at(-1);
		expect(last?.code).toBe("c0s9\n⋯ 50 more scenes");
		expect(last?.label).toBe("Change 9");
	});

	it("keeps as many whole chapters as fit", () => {
		// 6 chapters of 5: three fit (15), the fourth would reach 20.
		const sequences = Array.from({ length: 6 }, (_, index) => chapter(index, 5));

		const cut = capWalkthrough(sequences);

		expect(cut.snapshots).toHaveLength(15);
		expect(cut.shownChapters).toBe(3);
		expect(cut.omittedSteps).toBe(15);
		expect(cut.snapshots.slice(0, -1)).toEqual(sequences.slice(0, 3).flat().slice(0, -1));
		expect(cut.snapshots.at(-1)?.code).toBe("c2s4\n⋯ 15 more scenes");
	});

	it("drops a whole chapter that would straddle the cap, never half of it", () => {
		const sequences = [chapter(0, 10), chapter(1, 10), chapter(2, 2)];

		const cut = capWalkthrough(sequences);

		// The second chapter would reach 20: it goes whole, and so does the small one after it.
		expect(cut.snapshots).toHaveLength(10);
		expect(cut.shownChapters).toBe(1);
		expect(cut.omittedSteps).toBe(12);
		expect(cut.snapshots.at(-1)?.code).toBe("c0s9\n⋯ 12 more scenes");
	});

	it("cuts inside the first chapter when it alone is past the cap", () => {
		// A 45-hunk single file stages 47 steps.
		const cut = capWalkthrough([chapter(0, 47)]);

		expect(cut.snapshots).toHaveLength(MAX_DIFF_STEPS);
		expect(cut.snapshots.slice(0, -1)).toEqual(chapter(0, 47).slice(0, MAX_DIFF_STEPS - 1));
		expect(cut.snapshots.at(-1)?.code).toBe(`c0s${MAX_DIFF_STEPS - 1}\n⋯ 31 more scenes`);
		expect(cut.shownChapters).toBe(1);
		expect(cut.totalChapters).toBe(1);
		expect(cut.omittedSteps).toBe(31);
		expect(cut.cutWithinChapter).toBe(true);
	});

	it("says 'scene' for a single omitted step", () => {
		const cut = capWalkthrough([chapter(0, MAX_DIFF_STEPS + 1)]);

		expect(cut.snapshots.at(-1)?.code).toBe(`c0s${MAX_DIFF_STEPS - 1}\n⋯ 1 more scene`);
	});

	it("shares the budget's own marker row instead of stacking a second one under it", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({
			code: "tail\n⋯ 4 more files",
			label: "After",
		});

		const cut = capWalkthrough([kept, chapter(1, 5)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯ 4 more files, 5 more scenes");
	});

	it("lets the count replace the generic hidden-changes marker", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({
			code: "tail\n⋯ more changes hidden",
			label: "After",
		});

		const cut = capWalkthrough([kept, chapter(1, 3)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯ 3 more scenes");
	});

	it("lets the marker take the place of a trailing separator, since both say there is more", () => {
		const kept = chapter(0, MAX_DIFF_STEPS - 1).concat({ code: "tail\n⋯", label: "After" });

		const cut = capWalkthrough([kept, chapter(1, 3)]);

		expect(cut.snapshots.at(-1)?.code).toBe("tail\n⋯ 3 more scenes");
	});

	it("takes no chapters at all as nothing", () => {
		const cut = capWalkthrough([]);

		expect(cut.snapshots).toEqual([]);
		expect(cut.totalChapters).toBe(0);
	});
});

describe("the marker takes a row's place instead of adding one", () => {
	/** Every frame of a page holds the same rows but for the ones a step changes. */
	const page = (count: number, last: string[] = ["row 1", "row 2", "row 3"]) =>
		Array.from({ length: count }, (_, index) => ({
			code: (index === MAX_DIFF_STEPS - 1 ? last : ["row 1", "row 2", "row 3"]).join("\n"),
			label: `Change ${index}`,
		}));
	const rows = (code: string | undefined) => (code ?? "").split("\n").length;

	it("drops the last row of the last frame when the siblings are as tall, so the card keeps its height", () => {
		const cut = capWalkthrough([page(MAX_DIFF_STEPS + 4)]);

		expect(cut.snapshots).toHaveLength(MAX_DIFF_STEPS);
		for (const snapshot of cut.snapshots) {
			expect(rows(snapshot.code)).toBe(3);
		}
		expect(cut.snapshots.at(-1)?.code).toBe("row 1\nrow 2\n⋯ 4 more scenes");
	});

	it("adds the row when the last frame is shorter than the tallest, since the card does not grow", () => {
		const frames = page(MAX_DIFF_STEPS + 4);
		frames[MAX_DIFF_STEPS - 1] = { code: "row 1\nrow 2", label: "Change 15" };
		frames[MAX_DIFF_STEPS - 2] = { code: "row 1\nrow 2\nrow 3", label: "Change 14" };

		const cut = capWalkthrough([frames]);

		expect(cut.snapshots.at(-1)?.code).toBe("row 1\nrow 2\n⋯ 4 more scenes");
		expect(Math.max(...cut.snapshots.map((s) => rows(s.code)))).toBe(3);
	});

	it("keeps a row the last step itself changed, even if the card grows by one", () => {
		const cut = capWalkthrough([page(MAX_DIFF_STEPS + 4, ["row 1", "row 2", "row 3 changed"])]);

		expect(cut.snapshots.at(-1)?.code).toBe("row 1\nrow 2\nrow 3 changed\n⋯ 4 more scenes");
	});

	it("keeps both counts in the merged row, without a row more", () => {
		const frames = page(MAX_DIFF_STEPS + 4, ["row 1", "row 2", "⋯ 4 more files"]);

		const cut = capWalkthrough([frames]);

		expect(rows(cut.snapshots.at(-1)?.code)).toBe(3);
		expect(cut.snapshots.at(-1)?.code).toBe("row 1\nrow 2\n⋯ 4 more files, 4 more scenes");
	});
});

describe("cutNotice", () => {
	it("names how many commits the video starts with when some were cut", () => {
		const cut = capWalkthrough(Array.from({ length: 6 }, (_, index) => chapter(index, 5)));

		expect(cutNotice(cut)).toBe("Showing the first 3 of 6 commits");
	});

	it("names how many scenes a single diff plays when it was cut", () => {
		const cut = capWalkthrough([chapter(0, 47)]);

		expect(cutNotice(cut)).toBe("Showing the first 16 of 47 scenes");
	});

	it("counts scenes, not commits, when the first commit is itself cut", () => {
		// Two commits of 45 hunks: the first alone is past the cap, so "1 of 2 commits"
		// would say the first commit plays whole.
		const cut = capWalkthrough([chapter(0, 48), chapter(1, 47)]);

		expect(cut.shownChapters).toBe(1);
		expect(cutNotice(cut)).toBe("Showing the first 16 of 95 scenes");
	});

	it("is silent when everything plays", () => {
		expect(cutNotice(capWalkthrough([chapter(0, 7), chapter(1, 9)]))).toBeNull();
		expect(cutNotice(capWalkthrough([chapter(0, 3)]))).toBeNull();
	});
});
