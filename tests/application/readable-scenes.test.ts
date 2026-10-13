import { readFileSync } from "node:fs";
import { MAX_SCENE_LINES, chapterSnapshots, diffToSnapshots } from "@/application/diff";
import type { CodeSnapshot } from "@/application/diff";
import { captionFromGeneratedLabel } from "@/domain/entities/step";
import { describe, expect, it } from "vitest";
import { MIN_READABLE_CODE_PX, effectiveCodePx, measureScenes } from "../support/scene-readability";

/** honojs/hono#5189, fetched token-free from api.github.com: the hero's example PR. */
const HONO_PR = readFileSync("tests/fixtures/hono-pr-5189.diff", "utf8");

const LANDSCAPE = { width: 1920, height: 1080 };
const PORTRAIT = { width: 1080, height: 1920 };

function pxOf(snapshots: CodeSnapshot[], canvas: { width: number; height: number }): number {
	const measured = measureScenes(snapshots.map((snapshot) => snapshot.code));
	const captions = snapshots.map((snapshot) => captionFromGeneratedLabel(snapshot.label) ?? "");
	return effectiveCodePx({ ...measured, canvas, captions });
}

const nl = (lines: string[]) => lines.join("\n");

/** One file that inserts `added` lines between two context lines: a single tall hunk. */
function tallHunk(added: number, heading = ""): string {
	return nl([
		"--- a/big.ts",
		"+++ b/big.ts",
		`@@ -1,2 +1,${added + 2} @@${heading ? ` ${heading}` : ""}`,
		" const header = 1;",
		...Array.from({ length: added }, (_, i) => `+const row${i + 1} = ${i + 1};`),
		" const footer = 2;",
	]);
}

describe("the hero's example PR", () => {
	const { snapshots } = diffToSnapshots(HONO_PR);

	it("draws every scene at 18 px or more in the 1080p frame", () => {
		expect(pxOf(snapshots, LANDSCAPE)).toBeGreaterThanOrEqual(MIN_READABLE_CODE_PX);
	});

	it("holds no scene past the per-scene cap", () => {
		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
	});

	it("is limited by the width, not the height, on a 9:16 canvas", () => {
		// The 72-column line sets the portrait size whatever the line count.
		const px = pxOf(snapshots, PORTRAIT);
		const oneLine = effectiveCodePx({
			lineCounts: [1],
			longestLine: measureScenes(snapshots.map((s) => s.code)).longestLine,
			canvas: PORTRAIT,
		});
		expect(px).toBeGreaterThan(oneLine - 1.5);
	});

	it("shows all three files, node.ts (the fix) included, and says nothing is left out", () => {
		const all = snapshots.map((snapshot) => snapshot.code).join("\n");

		for (const path of [
			"src/router/common.case.test.ts",
			"src/router/trie-router/node.test.ts",
			"src/router/trie-router/node.ts",
		]) {
			expect(all).toContain(`// ${path}`);
		}
		expect(all).not.toContain("more file");
		expect(all).not.toContain("more changes hidden");
	});

	it("still shows the whole hunk: the code of the PR is in the scenes, in order", () => {
		const all = snapshots.map((snapshot) => snapshot.code).join("\n");
		for (const needle of [
			"GET /foo/bar/baz/file.html",
			"GET /a/b/c/d/file.html",
			"Pattern spanning multiple parts",
			"followed by a static part",
		]) {
			expect(all).toContain(needle);
		}
	});

	it("sets the cap by measurement: it holds the floor, with a row to spare, and two more would not", () => {
		const longestLine = measureScenes(snapshots.map((s) => s.code)).longestLine;
		const at = (lines: number, caption = "Change 1") =>
			effectiveCodePx({ lineCounts: [lines], longestLine, canvas: LANDSCAPE, captions: [caption] });
		// A heading as long as a caption may be (80 characters) wraps in the band.
		const wrapped = "x".repeat(40).concat(" ", "y".repeat(39));

		expect(at(MAX_SCENE_LINES)).toBeGreaterThanOrEqual(MIN_READABLE_CODE_PX);
		expect(at(MAX_SCENE_LINES, wrapped)).toBeGreaterThanOrEqual(MIN_READABLE_CODE_PX);
		expect(at(MAX_SCENE_LINES + 2)).toBeLessThan(MIN_READABLE_CODE_PX);
	});

	it("measured 56 rows, 9.4 px, before the cap", () => {
		const longestLine = measureScenes(snapshots.map((s) => s.code)).longestLine;

		expect(
			effectiveCodePx({ lineCounts: [56], longestLine, canvas: LANDSCAPE, captions: ["Change 1"] }),
		).toBeLessThan(10);
	});
});

describe("a hunk taller than a scene", () => {
	const { snapshots } = diffToSnapshots(tallHunk(40, "function big()"));

	it("continues in the next scene instead of fitting one tall card", () => {
		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
		expect(snapshots.length).toBeGreaterThan(2);
	});

	it("opens a continuation with the ⋯ separator, and closes the piece before it with one", () => {
		const pieces = snapshots.filter((snapshot) => snapshot.code.includes("const row"));
		const first = pieces[0]?.code.split("\n") ?? [];
		const last = pieces.at(-1)?.code.split("\n") ?? [];

		expect(first.at(-1)).toBe("⋯");
		expect(last[0]).toBe("⋯");
	});

	it("leaves no added line out: every row of the hunk shows in some scene", () => {
		const all = snapshots.map((snapshot) => snapshot.code).join("\n");
		for (let i = 1; i <= 40; i++) {
			expect(all).toContain(`const row${i} = ${i};`);
		}
	});

	it("gives a continuation the caption of the hunk it continues, and the walkthrough its own ends", () => {
		const labels = snapshots.map((snapshot) => snapshot.label);

		expect(labels[0]).toBe("Before");
		expect(labels.at(-1)).toBe("After");
		const middle = labels.slice(1, -1);
		expect(middle.length).toBeGreaterThan(0);
		expect(new Set(middle)).toEqual(new Set(["function big()"]));
	});

	it("numbers an unheaded hunk's continuations by the hunk, not by the piece", () => {
		const { snapshots: plain } = diffToSnapshots(tallHunk(40));

		expect(new Set(plain.slice(1, -1).map((snapshot) => snapshot.label))).toEqual(
			new Set(["Change 1"]),
		);
	});
});

describe("a diff that fits one scene", () => {
	it("is unsplit: Before, the change, After, no ⋯ added", () => {
		const { snapshots } = diffToSnapshots(tallHunk(6));

		expect(snapshots.map((snapshot) => snapshot.label)).toEqual(["Before", "After"]);
		expect(snapshots[1]?.code.split("\n")).toHaveLength(8);
	});
});

describe("a multi-file diff split in scenes", () => {
	const twoFiles = nl([
		"--- a/one.ts",
		"+++ b/one.ts",
		"@@ -1,2 +1,22 @@",
		" const a = 1;",
		...Array.from({ length: 20 }, (_, i) => `+const one${i} = ${i};`),
		" const z = 1;",
		"--- a/two.ts",
		"+++ b/two.ts",
		"@@ -1,2 +1,22 @@",
		" const c = 1;",
		...Array.from({ length: 20 }, (_, i) => `+const two${i} = ${i};`),
		" const y = 1;",
	]);

	it("heads every scene with the file it shows, as the unsplit diff does", () => {
		const { snapshots } = diffToSnapshots(twoFiles);

		expect(snapshots.length).toBeGreaterThan(2);
		for (const snapshot of snapshots) {
			expect(snapshot.code).toMatch(/^\/\/ (one|two)\.ts$/m);
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
	});
});

describe("a chaptered PR", () => {
	it("splits each chapter's scenes the same way and keeps the chapter heading on its first scene", () => {
		const snapshots = chapterSnapshots([
			{ title: "first commit", diffText: tallHunk(40, "function big()") },
			{ title: "second commit", diffText: tallHunk(40, "function big()") },
		]);

		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
		const headings = snapshots.filter((snapshot) => /^\d\/2 · /.test(snapshot.label ?? ""));
		expect(headings.map((snapshot) => snapshot.label)).toEqual([
			"1/2 · first commit",
			"2/2 · second commit",
		]);
	});
});

/** A block replacing `count` lines `old1..` by `count` lines `neu1..`, between two context lines. */
function replacement(count: number): string {
	return nl([
		"--- a/swap.ts",
		"+++ b/swap.ts",
		`@@ -1,${count + 2} +1,${count + 2} @@ function swap()`,
		" const head = 0;",
		...Array.from({ length: count }, (_, i) => `-const old${i + 1} = ${i + 1};`),
		...Array.from({ length: count }, (_, i) => `+const neu${i + 1} = ${i + 1};`),
		" const tail = 0;",
	]);
}

const indicesOf = (code: string, name: "old" | "neu") =>
	[...code.matchAll(new RegExp(`const ${name}(\\d+) =`, "g"))].map((match) => Number(match[1]));

describe("a block replaced by another, taller than a scene", () => {
	const { snapshots } = diffToSnapshots(replacement(30));

	it("morphs each old line into its new line face to face: the frame after a page's old lines shows the same indices as new", () => {
		const shown = snapshots.map((snapshot) => ({
			old: indicesOf(snapshot.code, "old"),
			neu: indicesOf(snapshot.code, "neu"),
		}));
		const withOld = shown.flatMap((frame, index) => (frame.old.length > 0 ? [index] : []));

		expect(withOld.length).toBeGreaterThan(1);
		for (const index of withOld) {
			expect(shown[index + 1]?.neu).toEqual(shown[index]?.old);
		}
	});

	it("never empties the card between the old and the new of a page", () => {
		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeGreaterThan(3);
		}
	});

	it("shows every old line before it is replaced and every new line after", () => {
		const old = new Set(snapshots.flatMap((snapshot) => indicesOf(snapshot.code, "old")));
		const neu = new Set(snapshots.flatMap((snapshot) => indicesOf(snapshot.code, "neu")));

		expect(old.size).toBe(30);
		expect(neu.size).toBe(30);
	});
});

describe("a continuation of an addition", () => {
	it("has no opening frame of its own: 40 added lines play as three frames", () => {
		const { snapshots } = diffToSnapshots(tallHunk(40, "function big()"));

		expect(snapshots.map((snapshot) => snapshot.label)).toEqual([
			"Before",
			"function big()",
			"After",
		]);
	});
});

describe("the caption of a scene", () => {
	/** The file each hunk heading of the diff belongs to. */
	function headingFiles(diff: string): Map<string, string> {
		const files = new Map<string, string>();
		let path = "";
		for (const line of diff.split("\n")) {
			path = line.startsWith("+++ b/") ? line.slice("+++ b/".length) : path;
			const heading = line.match(/^@@ [^@]+ @@ (.+)$/)?.[1];
			if (heading) {
				files.set(heading, path);
			}
		}
		return files;
	}

	it("names a hunk of the file the scene shows (hono#5189)", () => {
		const { snapshots } = diffToSnapshots(HONO_PR);
		const owner = headingFiles(HONO_PR);
		let checked = 0;

		for (const snapshot of snapshots) {
			const file = owner.get(snapshot.label ?? "");
			if (file) {
				expect(snapshot.code).toContain(`// ${file}`);
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(2);
	});

	it("takes the first hunk's own caption when a page opens on another hunk, never the last one's", () => {
		const { snapshots } = diffToSnapshots(HONO_PR);
		const nodeFrame = snapshots.find((snapshot) =>
			snapshot.code.includes("// src/router/trie-router/node.ts"),
		);

		expect(nodeFrame?.label).not.toBe("describe('The same name is used for path params', () => {");
	});
});
