import { diffToSnapshots } from "@/application/diff/diff-to-snapshots";
import { describe, expect, it } from "vitest";

const nl = (lines: string[]) => lines.join("\n");

describe("diffToSnapshots", () => {
	it("turns a realistic single-hunk diff into an animatable before/after sequence", () => {
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

		const result = diffToSnapshots(diff);

		expect(result.snapshots).toHaveLength(2);
		expect(result.snapshots[0]?.code).toBe(
			nl(["function greet(name) {", '  return "Hello " + name;', "}"]),
		);
		expect(result.snapshots[1]?.code).toBe(
			nl(["function greet(name) {", "  return `Hello, ${name}!`;", "}"]),
		);
		expect(result.language).toBe("typescript");
		expect(result.path).toBe("src/greet.ts");
		expect(result.fileCount).toBe(1);
	});

	it("defaults to progressive hunk-by-hunk sequencing", () => {
		const diff = nl([
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

		const result = diffToSnapshots(diff);
		expect(result.snapshots).toHaveLength(3);
	});

	it("honours before-after mode", () => {
		const diff = nl([
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

		const result = diffToSnapshots(diff, { mode: "before-after" });
		expect(result.snapshots).toHaveLength(2);
	});

	it("handles a new file by dropping the empty 'before' snapshot", () => {
		const diff = nl([
			"diff --git a/greeter.py b/greeter.py",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/greeter.py",
			"@@ -0,0 +1,2 @@",
			"+def greet(name):",
			'+    return f"Hello, {name}!"',
		]);

		const result = diffToSnapshots(diff);

		// The empty "before" frame is filtered; the added content remains.
		expect(result.snapshots.every((s) => s.code.trim().length > 0)).toBe(true);
		expect(result.snapshots.at(-1)?.code).toBe(
			nl(["def greet(name):", '    return f"Hello, {name}!"']),
		);
		expect(result.language).toBe("python");
	});

	it("throws on empty input", () => {
		expect(() => diffToSnapshots("")).toThrow();
		expect(() => diffToSnapshots("   \n  ")).toThrow();
	});

	it("throws when the input contains no diff hunks", () => {
		expect(() => diffToSnapshots("this is not a diff at all")).toThrow();
	});

	it("drops a lockfile and keeps the real changed file", () => {
		const diff = nl([
			"diff --git a/package.json b/package.json",
			"--- a/package.json",
			"+++ b/package.json",
			"@@ -1,3 +1,3 @@",
			" {",
			'-  "version": "1.0.0"',
			'+  "version": "1.1.0"',
			" }",
			"diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
			"--- a/pnpm-lock.yaml",
			"+++ b/pnpm-lock.yaml",
			"@@ -1,2 +1,2 @@",
			"-lockfileVersion: '6.0'",
			"+lockfileVersion: '9.0'",
			" settings:",
		]);

		const result = diffToSnapshots(diff);

		expect(result.fileCount).toBe(1);
		expect(result.path).toBe("package.json");
		// No lockfile noise survives, and a single kept file needs no header.
		for (const snapshot of result.snapshots) {
			expect(snapshot.code).not.toContain("lockfileVersion");
			expect(snapshot.code).not.toContain("// ");
		}
	});

	it("keeps lockfiles when they are all the diff has", () => {
		const diff = nl([
			"diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
			"--- a/pnpm-lock.yaml",
			"+++ b/pnpm-lock.yaml",
			"@@ -1,2 +1,2 @@",
			"-lockfileVersion: '6.0'",
			"+lockfileVersion: '9.0'",
			" settings:",
		]);

		const result = diffToSnapshots(diff);

		expect(result.fileCount).toBe(1);
		expect(result.snapshots.length).toBeGreaterThan(0);
		expect(result.snapshots.at(-1)?.code).toContain("lockfileVersion: '9.0'");
	});

	it("labels a multi-file diff with a stable // path header per file", () => {
		const diff = nl([
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 3;",
			"diff --git a/src/b.ts b/src/b.ts",
			"--- a/src/b.ts",
			"+++ b/src/b.ts",
			"@@ -1,2 +1,2 @@",
			" const c = 1;",
			"-const d = 2;",
			"+const d = 3;",
		]);

		const result = diffToSnapshots(diff);

		expect(result.fileCount).toBe(2);
		for (const snapshot of result.snapshots) {
			expect(snapshot.code).toContain("// src/a.ts");
			expect(snapshot.code).toContain("// src/b.ts");
		}
	});

	it("renders full frames through the windowing:false escape hatch", () => {
		const twoHunk = nl([
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

		const result = diffToSnapshots(twoHunk, { windowing: false });

		// Legacy behaviour: no windows, no separators, the full hunked frame.
		expect(result.snapshots[0]?.code).toBe(
			nl(["const a = 1;", "const b = 2;", "const c = 3;", "const e = 5;"]),
		);
		for (const snapshot of result.snapshots) {
			expect(snapshot.code).not.toContain("⋯");
		}
	});
});
