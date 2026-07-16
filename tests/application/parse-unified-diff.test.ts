import { parseUnifiedDiff } from "@/application/diff/parse-unified-diff";
import { describe, expect, it } from "vitest";

const nl = (lines: string[]) => lines.join("\n");

describe("parseUnifiedDiff", () => {
	it("parses a single-file, single-hunk modification", () => {
		const diff = nl([
			"diff --git a/src/greet.ts b/src/greet.ts",
			"index 1234567..89abcde 100644",
			"--- a/src/greet.ts",
			"+++ b/src/greet.ts",
			"@@ -1,3 +1,3 @@",
			" function greet(name) {",
			'-  return "Hello " + name;',
			"+  return `Hello, ${name}!`;",
			" }",
		]);

		const parsed = parseUnifiedDiff(diff);

		expect(parsed.files).toHaveLength(1);
		const file = parsed.files[0];
		expect(file?.oldPath).toBe("src/greet.ts");
		expect(file?.newPath).toBe("src/greet.ts");
		expect(file?.isNew).toBe(false);
		expect(file?.isDeleted).toBe(false);
		expect(file?.hunks).toHaveLength(1);

		const hunk = file?.hunks[0];
		expect(hunk?.oldStart).toBe(1);
		expect(hunk?.oldLines).toBe(3);
		expect(hunk?.newStart).toBe(1);
		expect(hunk?.newLines).toBe(3);
		expect(hunk?.lines.map((l) => l.type)).toEqual(["context", "remove", "add", "context"]);
		expect(hunk?.lines[1]?.content).toBe('  return "Hello " + name;');
		expect(hunk?.lines[2]?.content).toBe("  return `Hello, ${name}!`;");
	});

	it("parses multiple hunks in one file", () => {
		const diff = nl([
			"--- a/app.ts",
			"+++ b/app.ts",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 20;",
			"@@ -10,2 +10,3 @@ function tail()",
			" const c = 3;",
			"+const d = 4;",
			" const e = 5;",
		]);

		const parsed = parseUnifiedDiff(diff);
		const file = parsed.files[0];

		expect(file?.hunks).toHaveLength(2);
		expect(file?.hunks[0]?.newLines).toBe(2);
		expect(file?.hunks[1]?.oldStart).toBe(10);
		expect(file?.hunks[1]?.heading).toBe("function tail()");
		expect(file?.hunks[1]?.lines.map((l) => l.type)).toEqual(["context", "add", "context"]);
	});

	it("parses multiple files in one diff", () => {
		const diff = nl([
			"diff --git a/one.ts b/one.ts",
			"--- a/one.ts",
			"+++ b/one.ts",
			"@@ -1 +1 @@",
			"-let x = 1;",
			"+let x = 2;",
			"diff --git a/two.ts b/two.ts",
			"--- a/two.ts",
			"+++ b/two.ts",
			"@@ -1 +1 @@",
			"-let y = 1;",
			"+let y = 2;",
		]);

		const parsed = parseUnifiedDiff(diff);

		expect(parsed.files).toHaveLength(2);
		expect(parsed.files[0]?.newPath).toBe("one.ts");
		expect(parsed.files[1]?.newPath).toBe("two.ts");
		// Hunk header without counts defaults to a single line.
		expect(parsed.files[0]?.hunks[0]?.oldLines).toBe(1);
		expect(parsed.files[0]?.hunks[0]?.newLines).toBe(1);
	});

	it("recognizes a newly added file (/dev/null source)", () => {
		const diff = nl([
			"diff --git a/new.ts b/new.ts",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/new.ts",
			"@@ -0,0 +1,2 @@",
			"+export const a = 1;",
			"+export const b = 2;",
		]);

		const parsed = parseUnifiedDiff(diff);
		const file = parsed.files[0];

		expect(file?.isNew).toBe(true);
		expect(file?.oldPath).toBeNull();
		expect(file?.newPath).toBe("new.ts");
		expect(file?.hunks[0]?.lines.every((l) => l.type === "add")).toBe(true);
	});

	it("recognizes a deleted file (/dev/null target)", () => {
		const diff = nl([
			"diff --git a/gone.ts b/gone.ts",
			"deleted file mode 100644",
			"--- a/gone.ts",
			"+++ /dev/null",
			"@@ -1,2 +0,0 @@",
			"-export const a = 1;",
			"-export const b = 2;",
		]);

		const parsed = parseUnifiedDiff(diff);
		const file = parsed.files[0];

		expect(file?.isDeleted).toBe(true);
		expect(file?.newPath).toBeNull();
		expect(file?.oldPath).toBe("gone.ts");
		expect(file?.hunks[0]?.lines.every((l) => l.type === "remove")).toBe(true);
	});

	it("parses a plain unified diff without a `diff --git` header", () => {
		const diff = nl([
			"--- a/plain.js",
			"+++ b/plain.js",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 3;",
		]);

		const parsed = parseUnifiedDiff(diff);

		expect(parsed.files).toHaveLength(1);
		expect(parsed.files[0]?.newPath).toBe("plain.js");
		expect(parsed.files[0]?.hunks).toHaveLength(1);
	});

	it("uses hunk line counts, so added content that looks like a header is kept verbatim", () => {
		const diff = nl([
			"--- a/md.txt",
			"+++ b/md.txt",
			"@@ -1,2 +1,3 @@",
			" keep",
			"+--- this is content, not a file header",
			" tail",
		]);

		const parsed = parseUnifiedDiff(diff);
		const hunk = parsed.files[0]?.hunks[0];

		expect(hunk?.lines.map((l) => l.type)).toEqual(["context", "add", "context"]);
		expect(hunk?.lines[1]?.content).toBe("--- this is content, not a file header");
	});

	it("treats a stripped blank line inside a hunk as a blank context line", () => {
		const diff = nl([
			"--- a/blank.ts",
			"+++ b/blank.ts",
			"@@ -1,4 +1,4 @@",
			" a",
			"", // blank context line whose leading space was trimmed
			"-b",
			"+c",
			" d",
		]);

		const parsed = parseUnifiedDiff(diff);
		const hunk = parsed.files[0]?.hunks[0];

		expect(hunk?.lines.map((l) => l.type)).toEqual([
			"context",
			"context",
			"remove",
			"add",
			"context",
		]);
		expect(hunk?.lines[1]?.content).toBe("");
	});

	it("ignores the '\\ No newline at end of file' marker", () => {
		const diff = nl([
			"--- a/eof.ts",
			"+++ b/eof.ts",
			"@@ -1 +1 @@",
			"-old",
			"\\ No newline at end of file",
			"+new",
			"\\ No newline at end of file",
		]);

		const parsed = parseUnifiedDiff(diff);
		const hunk = parsed.files[0]?.hunks[0];

		expect(hunk?.lines.map((l) => l.type)).toEqual(["remove", "add"]);
		expect(hunk?.lines[0]?.content).toBe("old");
		expect(hunk?.lines[1]?.content).toBe("new");
	});

	it("returns no files for input that is not a diff", () => {
		const parsed = parseUnifiedDiff("just some\nplain text\nwith no hunks");
		expect(parsed.files).toEqual([]);
	});

	it("tolerates a bare hunk with no file header", () => {
		const diff = nl(["@@ -1 +1 @@", "-a", "+b"]);
		const parsed = parseUnifiedDiff(diff);

		expect(parsed.files).toHaveLength(1);
		expect(parsed.files[0]?.oldPath).toBeNull();
		expect(parsed.files[0]?.hunks[0]?.lines.map((l) => l.type)).toEqual(["remove", "add"]);
	});
});
