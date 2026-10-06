import { projectFromDiff } from "@/application/import/diff-project";
import {
	type ImportFetchers,
	importFailureDetailOf,
	importFailureOf,
	importSource,
	importSourceKey,
	readImportSource,
	remoteSourceOf,
} from "@/application/import/import-source";
import { releaseProject } from "@/application/import/release-project";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The cascade the CLI and the hosted render route share: a pasted string is a
 * GitHub link or a unified diff, and either becomes the project the studio
 * would hold. The network is injected; the real fetch is the infrastructure's.
 */

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,5 +1,6 @@
 export function greet(name: string) {
-  return "Hello " + name;
+  const trimmed = name.trim();
+  return \`Hello, \${trimmed}!\`;
 }

 console.log(greet("Typelapse"));
`;

function fetchers(overrides: Partial<ImportFetchers> = {}): ImportFetchers {
	return {
		fetchPr: vi.fn(async () => ({ diffText: DIFF, title: "Trim the name" })),
		fetchCommit: vi.fn(async () => ({ diffText: DIFF, title: "trim before greeting" })),
		fetchRelease: vi.fn(async () => ({
			card: { title: "Friendlier greetings", subtitle: "The name is trimmed first." },
			chapters: [{ title: "trim before greeting", diffText: DIFF }],
		})),
		...overrides,
	};
}

describe("remoteSourceOf", () => {
	it.each([
		[
			"https://github.com/octocat/Hello-World/pull/1/files",
			{ kind: "pr", ref: { owner: "octocat", repo: "Hello-World", number: 1 } },
		],
		[
			"github.com/octocat/Hello-World/commit/7fd1a60",
			{ kind: "commit", ref: { owner: "octocat", repo: "Hello-World", sha: "7fd1a60" } },
		],
		[
			"https://github.com/octocat/Hello-World/releases/tag/v1.2.0",
			{ kind: "release", ref: { owner: "octocat", repo: "Hello-World", tag: "v1.2.0" } },
		],
		[
			"https://github.com/octocat/Hello-World/compare/v1.1.0...v1.2.0",
			{
				kind: "compare",
				ref: { owner: "octocat", repo: "Hello-World", base: "v1.1.0", head: "v1.2.0" },
			},
		],
	])("reads %s", (link, expected) => {
		expect(remoteSourceOf(link)).toEqual(expected);
	});

	it.each([
		"https://gitlab.com/a/b/-/merge_requests/1",
		"https://github.com/octocat/Hello-World",
		"https://github.com/octocat/Hello-World/blob/main/README.md",
		"src/greet.ts",
		DIFF,
	])("reads nothing from %j", (input) => {
		expect(remoteSourceOf(input)).toBeNull();
	});
});

describe("readImportSource", () => {
	it("reads a link as the source it names", () => {
		expect(readImportSource("  https://github.com/o/r/pull/9\n")).toEqual({
			outcome: "read",
			source: { kind: "pr", ref: { owner: "o", repo: "r", number: 9 } },
		});
	});

	it("reads a unified diff, trimmed the way the studio's import trims a paste", () => {
		expect(readImportSource(`\n${DIFF}\n`)).toEqual({
			outcome: "read",
			source: { kind: "diff", text: DIFF.trim() },
		});
	});

	it.each([
		["nothing", "   ", "Send a pull request, commit, release or compare link, or a unified diff"],
		[
			"a link to something else",
			"https://gitlab.com/a/b/-/merge_requests/1",
			"That link is not a GitHub pull request, commit, release or compare link",
		],
		[
			"a GitHub link that is not one of the four",
			"https://github.com/octocat/Hello-World/blob/main/README.md",
			"That link is not a GitHub pull request, commit, release or compare link",
		],
		[
			"text that is neither",
			"const greeting = 'hello';",
			"The source is neither a GitHub link nor a unified diff",
		],
	])("refuses %s in one sentence", (_case, input, message) => {
		expect(readImportSource(input)).toEqual({ outcome: "refused", message });
	});
});

describe("importSource", () => {
	it("builds a pull request into the project the studio's own import builds, with its title", async () => {
		const io = fetchers();
		const read = readImportSource("https://github.com/octocat/Hello-World/pull/1");
		if (read.outcome !== "read") throw new Error("expected a source");

		const imported = await importSource(read.source, io);

		expect(io.fetchPr).toHaveBeenCalledWith({ owner: "octocat", repo: "Hello-World", number: 1 });
		expect(imported).toEqual({
			kind: "pr",
			project: projectFromDiff(DIFF, { title: "Trim the name" }),
		});
	});

	it("builds a commit the same way", async () => {
		const io = fetchers();

		const imported = await importSource(
			{ kind: "commit", ref: { owner: "o", repo: "r", sha: "7fd1a60" } },
			io,
		);

		expect(io.fetchCommit).toHaveBeenCalledWith({ owner: "o", repo: "r", sha: "7fd1a60" });
		expect(imported.project).toEqual(projectFromDiff(DIFF, { title: "trim before greeting" }));
	});

	it("builds a release into its chaptered project and keeps its card", async () => {
		const io = fetchers();
		const ref = { owner: "o", repo: "r", tag: "v1.2.0" };

		const imported = await importSource({ kind: "release", ref }, io);

		expect(io.fetchRelease).toHaveBeenCalledWith(ref);
		expect(imported.kind).toBe("release");
		expect(imported.card).toEqual({
			title: "Friendlier greetings",
			subtitle: "The name is trimmed first.",
		});
		expect(imported.project).toEqual(
			releaseProject({ title: "Friendlier greetings", subtitle: "The name is trimmed first." }, [
				{ title: "trim before greeting", diffText: DIFF },
			]),
		);
		expect(imported.notice).toBeUndefined();
	});

	it("carries a compare range's notice with it", async () => {
		const io = fetchers({
			fetchRelease: async () => ({
				card: { title: "v0.1.0...v0.2.0" },
				chapters: [{ title: "", diffText: DIFF }],
				notice: "35 commits, shown as one change",
			}),
		});

		const imported = await importSource(
			{ kind: "compare", ref: { owner: "o", repo: "r", base: "v0.1.0", head: "v0.2.0" } },
			io,
		);

		expect(imported.kind).toBe("compare");
		expect(imported.notice).toBe("35 commits, shown as one change");
	});

	it("builds a diff without asking GitHub anything", async () => {
		const io = fetchers();

		const imported = await importSource({ kind: "diff", text: DIFF }, io);

		expect(imported).toEqual({ kind: "diff", project: projectFromDiff(DIFF) });
		expect(io.fetchPr).not.toHaveBeenCalled();
		expect(io.fetchCommit).not.toHaveBeenCalled();
		expect(io.fetchRelease).not.toHaveBeenCalled();
	});

	it("lets the importer's own sentence through when a fetch or a build fails", async () => {
		const io = fetchers({
			fetchPr: async () => Promise.reject(new Error("PR not found (or the repository is private)")),
		});

		await expect(
			importSource({ kind: "pr", ref: { owner: "o", repo: "r", number: 9 } }, io),
		).rejects.toThrow("PR not found (or the repository is private)");
		await expect(importSource({ kind: "diff", text: "diff --git a/x b/x" }, io)).rejects.toThrow(
			/no code to animate/,
		);
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe("importSource with a time budget", () => {
	const PR = { kind: "pr", ref: { owner: "octocat", repo: "Hello-World", number: 1 } } as const;

	/** A GitHub that never answers, and stops when it is told to. */
	function slowGitHub() {
		const told: AbortSignal[] = [];
		const slow = fetchers({
			fetchPr: vi.fn(
				(_ref, read) =>
					new Promise<never>((_resolve, reject) => {
						if (read?.signal) {
							told.push(read.signal);
							read.signal.addEventListener("abort", () => reject(new Error("Request timed out")));
						}
					}),
			),
		});
		return { slow, told };
	}

	it("refuses a read that outlasts it, naming the budget, and tells the read to stop", async () => {
		vi.useFakeTimers();
		const { slow, told } = slowGitHub();

		const reading = importSource(PR, slow, { budgetMs: 30_000 });
		const outcome = expect(reading).rejects.toThrow(
			"Reading the source took longer than 30 seconds",
		);
		await vi.advanceTimersByTimeAsync(30_000);

		await outcome;
		expect(told).toHaveLength(1);
		expect(told[0]?.aborted).toBe(true);
	});

	it("is not what a request's own timeout says", async () => {
		vi.useFakeTimers();
		const { slow } = slowGitHub();

		const reading = importSource(PR, slow, { budgetMs: 1_000 }).catch((error: Error) => error);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(importFailureOf(((await reading) as Error).message)).toBe("budget");
	});

	it("lets a read that is in time through, and leaves no timer behind", async () => {
		vi.useFakeTimers();

		const imported = await importSource(PR, fetchers(), { budgetMs: 30_000 });

		expect(imported.kind).toBe("pr");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps the budget of one source apart from the next", async () => {
		vi.useFakeTimers();
		const { slow } = slowGitHub();

		const first = importSource(PR, slow, { budgetMs: 1_000 }).catch(() => "refused");
		await vi.advanceTimersByTimeAsync(1_000);
		await first;

		await expect(importSource(PR, fetchers(), { budgetMs: 1_000 })).resolves.toMatchObject({
			kind: "pr",
		});
	});

	it("reads without any budget as it always did", async () => {
		const imported = await importSource(PR, fetchers());

		expect(imported.kind).toBe("pr");
	});
});

describe("importFailureDetailOf", () => {
	it("reads what GitHub said of its limit out of the importer's sentence", () => {
		expect(
			importFailureDetailOf(
				"GitHub rate limit hit (0 of 60 requests left, resets at 04:00 UTC): paste the diff instead",
			),
		).toBe("0 of 60 requests left, resets at 04:00 UTC");
	});

	it("is nothing when the sentence says nothing more", () => {
		expect(importFailureDetailOf("GitHub rate limit hit: paste the diff instead")).toBeUndefined();
		expect(importFailureDetailOf("")).toBeUndefined();
	});
});

describe("importFailureOf", () => {
	it.each([
		["PR not found (or the repository is private)", "not-found"],
		["Release not found (or the repository is private)", "not-found"],
		["GitHub rate limit hit: paste the diff instead", "rate-limit"],
		["GitHub rate limit hit: try again later", "rate-limit"],
		["GitHub will not compare a range this large: pass a smaller range", "range-too-large"],
		["GitHub will not serve a diff this large: paste a smaller diff instead", "too-large"],
		["Request timed out", "timeout"],
		["Reading the source took longer than 30 seconds", "budget"],
		[
			"GitHub rate limit hit (0 of 5000 requests left, resets at 04:00 UTC): try again later",
			"rate-limit",
		],
		["Could not reach GitHub: check your connection, or paste the diff instead", "unreachable"],
		["Could not fetch the change", "unfetchable"],
		["Could not fetch the change: paste the diff instead", "unfetchable"],
		["This change has no file differences to animate", "other"],
		["", "other"],
	])("reads %j as %s", (message, failure) => {
		expect(importFailureOf(message)).toBe(failure);
	});
});

describe("importSourceKey", () => {
	const keyOf = (input: string) => {
		const read = readImportSource(input);
		if (read.outcome !== "read") throw new Error("expected a source");
		return importSourceKey(read.source);
	};

	it("names one pull request however its link is written", () => {
		const key = keyOf("https://github.com/octocat/Hello-World/pull/1");

		expect(keyOf("github.com/Octocat/hello-world/pull/1/files?diff=split#top")).toBe(key);
		expect(keyOf("https://www.github.com/octocat/Hello-World/pull/1/commits")).toBe(key);
	});

	it("tells apart what is not the same change", () => {
		const keys = [
			keyOf("https://github.com/octocat/Hello-World/pull/1"),
			keyOf("https://github.com/octocat/Hello-World/pull/2"),
			keyOf("https://github.com/octocat/Hello-World/commit/7fd1a60"),
			keyOf("https://github.com/octocat/Hello-World/releases/tag/v1.0.0"),
			keyOf("https://github.com/octocat/Hello-World/releases/tag/V1.0.0"),
			keyOf("https://github.com/octocat/Hello-World/compare/v1.0.0...v1.1.0"),
			keyOf(DIFF),
		];

		expect(new Set(keys).size).toBe(keys.length);
	});

	it("names a diff by its text", () => {
		expect(keyOf(`${DIFF}\n\n`)).toBe(keyOf(DIFF));
		expect(keyOf(DIFF.replace("Hello,", "Bye,"))).not.toBe(keyOf(DIFF));
	});
});
