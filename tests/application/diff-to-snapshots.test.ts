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
});
