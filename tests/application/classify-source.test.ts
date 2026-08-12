import { classifySource, looksLikeUnifiedDiff } from "@/application/import/classify-source";
import { describe, expect, it } from "vitest";

describe("looksLikeUnifiedDiff", () => {
	it("recognises a git diff header", () => {
		expect(looksLikeUnifiedDiff("diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644")).toBe(true);
	});

	it("recognises a bare hunk header", () => {
		expect(looksLikeUnifiedDiff("@@ -1,6 +1,10 @@\n-old\n+new")).toBe(true);
	});

	it("recognises a hunk header without line counts", () => {
		expect(looksLikeUnifiedDiff("@@ -1 +1 @@\n-old\n+new")).toBe(true);
	});

	it("recognises a bare ---/+++ file pair", () => {
		expect(looksLikeUnifiedDiff("--- a/src/a.ts\n+++ b/src/a.ts\n@@")).toBe(true);
	});

	it("tolerates crlf line endings", () => {
		expect(looksLikeUnifiedDiff("diff --git a/a.ts b/a.ts\r\n@@ -1,2 +1,3 @@\r\n")).toBe(true);
	});

	it("does not fire on a hunk marker that is mid-line rather than at the start", () => {
		expect(looksLikeUnifiedDiff("const doc = `@@ -1,6 +1,10 @@`;")).toBe(false);
	});

	it("does not fire on ordinary code", () => {
		expect(looksLikeUnifiedDiff("const users = await db.users.all()")).toBe(false);
	});

	it("does not fire on empty input", () => {
		expect(looksLikeUnifiedDiff("   \n  ")).toBe(false);
	});
});

describe("classifySource", () => {
	it("calls blank input empty", () => {
		expect(classifySource("")).toBe("empty");
		expect(classifySource("   \n\t ")).toBe("empty");
	});

	it("calls a pull-request url a pr", () => {
		expect(classifySource("https://github.com/oven-sh/bun/pull/14210")).toBe("pr");
	});

	it("calls a protocol-less pull-request url a pr", () => {
		expect(classifySource("github.com/oven-sh/bun/pull/14210")).toBe("pr");
	});

	it("calls a commit url a commit", () => {
		expect(classifySource("https://github.com/o/r/commit/abc1234")).toBe("commit");
	});

	it("calls a gist url a code-url", () => {
		expect(classifySource("https://gist.github.com/user/abc123")).toBe("code-url");
	});

	it("calls a github blob url a code-url", () => {
		expect(classifySource("https://github.com/o/r/blob/main/src/index.ts")).toBe("code-url");
	});

	it("calls a pasted unified diff a diff", () => {
		expect(classifySource("@@ -1,2 +1,3 @@\n-a\n+b")).toBe("diff");
	});

	it("calls anything else a snippet", () => {
		expect(classifySource("const users = await db.users.all()")).toBe("snippet");
	});

	it("ignores surrounding whitespace", () => {
		expect(classifySource("  https://github.com/o/r/pull/7  ")).toBe("pr");
	});

	it("prefers the pr reading over the diff reading when both could match", () => {
		// A PR URL can never be a diff, but the ordering is what guarantees it.
		expect(classifySource("https://github.com/o/r/pull/7/files")).toBe("pr");
	});

	it("treats a multi-line code paste as a snippet, not a diff", () => {
		expect(classifySource("function a() {\n\treturn 1;\n}")).toBe("snippet");
	});
});
