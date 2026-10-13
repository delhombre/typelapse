import { chapterSequences, chapterSnapshots } from "@/application/diff/chapters";
import { describe, expect, it } from "vitest";

const nl = (lines: string[]) => lines.join("\n");

/** A single-hunk edit on `path`, swapping `from` for `to` between stable context. */
function editDiff(path: string, from: string, to: string): string {
	return nl([
		`--- a/${path}`,
		`+++ b/${path}`,
		"@@ -1,3 +1,3 @@",
		" const head = 0;",
		`-${from}`,
		`+${to}`,
		" const tail = 9;",
	]);
}

/** The windowed frame `editDiff` renders when `line` is the middle statement. */
function editFrame(line: string): string {
	return nl(["const head = 0;", line, "const tail = 9;"]);
}

const LOCK_ONLY = nl([
	"--- a/pnpm-lock.yaml",
	"+++ b/pnpm-lock.yaml",
	"@@ -1,2 +1,2 @@",
	"-lockfileVersion: '6.0'",
	"+lockfileVersion: '9.0'",
	" settings:",
]);

const TWO_HUNK = nl([
	"--- a/app.ts",
	"+++ b/app.ts",
	"@@ -1,2 +1,2 @@",
	" const a = 1;",
	"-const b = 2;",
	"+const b = 20;",
	"@@ -10,2 +10,3 @@",
	" const c = 3;",
	"+const d = 4;",
	" const e = 5;",
]);

const NEW_FILE = nl([
	"diff --git a/new.py b/new.py",
	"new file mode 100644",
	"--- /dev/null",
	"+++ b/new.py",
	"@@ -0,0 +1,2 @@",
	"+def greet(name):",
	'+    return f"Hi {name}"',
]);

describe("chapterSnapshots", () => {
	it("concatenates chapters in order, heading each chapter's first frame with k/N · subject", () => {
		const out = chapterSnapshots([
			{ title: "add a", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "add b", diffText: editDiff("b.ts", "const y = 1;", "const y = 2;") },
		]);

		// Chapter 1 keeps its before + after; chapter 2 drops its redundant before.
		expect(out.map((s) => s.label)).toEqual(["1/2 · add a", "After", "2/2 · add b"]);
		expect(out.map((s) => s.code)).toEqual([
			editFrame("const x = 1;"),
			editFrame("const x = 2;"),
			editFrame("const y = 2;"),
		]);
	});

	it("keeps the first chapter's before but drops later chapters' redundant before frame", () => {
		// Two edits to the same statement: chapter 2's before-state equals chapter 1's
		// after-state, so re-showing it would stall the walkthrough. It must be dropped.
		const out = chapterSnapshots([
			{ title: "one", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "two", diffText: editDiff("a.ts", "const x = 2;", "const x = 3;") },
		]);

		expect(out.map((s) => s.code)).toEqual([
			editFrame("const x = 1;"),
			editFrame("const x = 2;"),
			editFrame("const x = 3;"),
		]);
		// No consecutive duplicate: the redundant `x = 2` before-frame is gone.
		expect(out).toHaveLength(3);
	});

	it("relabels only each chapter's first frame, leaving inner frame labels intact", () => {
		const out = chapterSnapshots([{ title: "refactor", diffText: TWO_HUNK }]);

		// A two-hunk chapter renders before, change 1, after; only the first is reheaded.
		expect(out.map((s) => s.label)).toEqual(["1/1 · refactor", "Change 1", "After"]);
	});

	it("skips a lockfiles-only chapter and renumbers N over the kept chapters", () => {
		const out = chapterSnapshots([
			{ title: "real one", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "bump deps", diffText: LOCK_ONLY },
			{ title: "real two", diffText: editDiff("b.ts", "const y = 1;", "const y = 2;") },
		]);

		expect(out.map((s) => s.label)).toEqual(["1/2 · real one", "After", "2/2 · real two"]);
		for (const snapshot of out) {
			expect(snapshot.code).not.toContain("lockfileVersion");
		}
	});

	it("skips an empty chapter and renumbers N over the kept chapters", () => {
		const out = chapterSnapshots([
			{ title: "real one", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "nothing", diffText: "" },
			{ title: "real two", diffText: editDiff("b.ts", "const y = 1;", "const y = 2;") },
		]);

		expect(out.map((s) => s.label)).toEqual(["1/2 · real one", "After", "2/2 · real two"]);
	});

	it("returns an empty array when every chapter is skipped", () => {
		const out = chapterSnapshots([
			{ title: "deps", diffText: LOCK_ONLY },
			{ title: "nothing", diffText: "   " },
		]);
		expect(out).toEqual([]);
	});

	it("truncates a long commit subject to about 60 characters with an ellipsis", () => {
		const subject = "a".repeat(70);
		const out = chapterSnapshots([
			{ title: subject, diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
		]);

		expect(out[0]?.label).toBe(`1/1 · ${"a".repeat(59)}…`);
	});

	it("keeps a deletion-only later chapter whole: the file it removes, then the removal", () => {
		// The before frame of a deletion is the deleted file, which no earlier
		// chapter established, so it is kept and reheaded rather than dropped.
		const deleteFile = nl(["--- a/gone.ts", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-a", "-b"]);
		const out = chapterSnapshots([
			{ title: "seed", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "remove gone", diffText: deleteFile },
		]);

		expect(out.map((s) => s.label)).toEqual([
			"1/2 · seed",
			"After",
			"2/2 · remove gone",
			"gone.ts removed",
		]);
		const deletion = out.at(-2);
		expect(deletion?.code).toContain("a");
		expect(deletion?.code).toContain("b");
	});

	it("skips a commit that only touches the final newline instead of failing the pull request", () => {
		const newlineOnly = nl([
			"--- a/a.ts",
			"+++ b/a.ts",
			"@@ -1 +1 @@",
			"-const x = 2;",
			"\\ No newline at end of file",
			"+const x = 2;",
		]);
		const out = chapterSnapshots([
			{ title: "seed", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "add newline", diffText: newlineOnly },
		]);

		expect(out.map((s) => s.label)).toEqual(["1/1 · seed", "After"]);
	});

	it("does not over-drop a later chapter that is a brand-new file (it has no before frame)", () => {
		const out = chapterSnapshots([
			{ title: "seed", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "add greeter", diffText: NEW_FILE },
		]);

		// The new file's only frame is its added body: kept, reheaded, never dropped.
		expect(out).toHaveLength(3);
		expect(out.at(-1)?.label).toBe("2/2 · add greeter");
		expect(out.at(-1)?.code).toContain("def greet(name):");
	});

	it("forwards diff options to each chapter (windowing off yields no ellipsis)", () => {
		const out = chapterSnapshots([{ title: "refactor", diffText: TWO_HUNK }], {
			windowing: false,
		});
		for (const snapshot of out) {
			expect(snapshot.code).not.toContain("⋯");
		}
	});
});

describe("chapterSequences", () => {
	it("keeps each kept chapter apart, in order, and skips lockfiles-only ones", () => {
		const chapters = [
			{ title: "add alpha", diffText: editDiff("a.ts", "const x = 1;", "const x = 2;") },
			{ title: "lockfile", diffText: LOCK_ONLY },
			{ title: "add beta", diffText: editDiff("b.ts", "const y = 1;", "const y = 2;") },
		];

		const sequences = chapterSequences(chapters);

		expect(sequences).toHaveLength(2);
		expect(sequences.flat()).toEqual(chapterSnapshots(chapters));
		expect(sequences[0]?.[0]?.label).toBe("1/2 · add alpha");
		expect(sequences[1]?.[0]?.label).toBe("2/2 · add beta");
	});
});
