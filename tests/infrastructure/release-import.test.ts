import { fetchReleaseChapters } from "@/infrastructure/import/release-import";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A release is the range between its tag and the tag before it, chaptered by
 * commit. GitHub is mocked by URL here; the real fetch is proven against a
 * public release in the ticket's report.
 */

const API = "https://api.github.com/repos/o/r";
const RELEASE = { owner: "o", repo: "r", tag: "v1.2.0" };

function diffFor(name: string): string {
	return [
		`diff --git a/${name}.ts b/${name}.ts`,
		`--- a/${name}.ts`,
		`+++ b/${name}.ts`,
		"@@ -1 +1 @@",
		`-const ${name} = 1;`,
		`+const ${name} = 2;`,
		"",
	].join("\n");
}

function commit(sha: string, message: string, parents = 1) {
	return {
		sha,
		commit: { message },
		parents: Array.from({ length: parents }, (_, index) => ({ sha: `${sha}-p${index}` })),
	};
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Route each GitHub URL to a response; anything unrouted is a 404 and is
 * recorded. A route gets the Accept header, since a compare is asked for as
 * JSON or as a diff at the same URL.
 */
function github(routes: Record<string, (accept: string) => Response>) {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const accept = new Headers(init?.headers).get("Accept") ?? "";
			calls.push(accept.endsWith(".diff") ? `${url} (diff)` : url);
			const route = routes[url];
			return route ? route(accept) : json({ message: "Not Found" }, 404);
		}),
	);
	return calls;
}

const asDiff = (accept: string) => accept.endsWith(".diff");

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchReleaseChapters", () => {
	it("compares the tag with the one before it and chapters the commits in order", async () => {
		const calls = github({
			[`${API}/releases/tags/v1.2.0`]: () =>
				json({ name: "Faster imports", tag_name: "v1.2.0", body: "Twice as fast.\n\n## Notes" }),
			[`${API}/tags?per_page=100&page=1`]: () =>
				json([{ name: "v1.2.0" }, { name: "v1.1.0" }, { name: "v1.0.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: () =>
				json({
					total_commits: 3,
					commits: [
						commit("aaa1111", "Read the cache first\n\nbody"),
						commit("mmm2222", "Merge pull request #3", 2),
						commit("bbb3333", "Skip empty files"),
					],
				}),
			[`${API}/commits/aaa1111`]: () => new Response(diffFor("cache")),
			[`${API}/commits/bbb3333`]: () => new Response(diffFor("files")),
		});
		const progress: string[] = [];

		const walkthrough = await fetchReleaseChapters(RELEASE, (done, total) =>
			progress.push(`${done}/${total}`),
		);

		expect(walkthrough.card).toEqual({ title: "Faster imports", subtitle: "Twice as fast." });
		expect(walkthrough.chapters.map((chapter) => chapter.title)).toEqual([
			"Read the cache first",
			"Skip empty files",
		]);
		expect(walkthrough.chapters[0]?.diffText).toBe(diffFor("cache"));
		expect(walkthrough.notice).toBeUndefined();
		expect(progress).toEqual(["1/2", "2/2"]);
		// A merge commit repeats the commits it merges: it is never fetched.
		expect(calls).not.toContain(`${API}/commits/mmm2222`);
	});

	it("runs from the first commit when the tag is the repository's first, and says so", async () => {
		github({
			[`${API}/releases/tags/v0.1.0`]: () => json({ name: "", tag_name: "v0.1.0", body: null }),
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v0.1.0" }]),
			// Newest first, as GitHub lists history.
			[`${API}/commits?sha=v0.1.0&per_page=31`]: () =>
				json([commit("bbb3333", "Add the parser"), commit("aaa1111", "Initial commit")]),
			[`${API}/commits/aaa1111`]: () => new Response(diffFor("init")),
			[`${API}/commits/bbb3333`]: () => new Response(diffFor("parser")),
		});

		const walkthrough = await fetchReleaseChapters({ ...RELEASE, tag: "v0.1.0" });

		expect(walkthrough.card).toEqual({ title: "v0.1.0" });
		expect(walkthrough.chapters.map((chapter) => chapter.title)).toEqual([
			"Initial commit",
			"Add the parser",
		]);
		expect(walkthrough.notice).toBe(
			"v0.1.0 is the first tag, so the video runs from the first commit",
		);
	});

	it("finds the previous tag past the first page of tags", async () => {
		const page1 = Array.from({ length: 100 }, (_, index) => ({ name: `v9.${99 - index}` }));
		const calls = github({
			[`${API}/tags?per_page=100&page=1`]: () => json(page1),
			[`${API}/tags?per_page=100&page=2`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: () =>
				json({ total_commits: 1, commits: [commit("aaa1111", "Fix")] }),
			[`${API}/commits/aaa1111`]: () => new Response(diffFor("fix")),
		});

		const walkthrough = await fetchReleaseChapters(RELEASE);

		// A tag with no release page still plays, under its own name.
		expect(walkthrough.card).toEqual({ title: "v1.2.0" });
		expect(calls).toContain(`${API}/compare/v1.1.0...v1.2.0`);
	});

	it("plays a compare link between the two refs it names", async () => {
		const calls = github({
			[`${API}/compare/v1.0.0...main`]: () =>
				json({ total_commits: 1, commits: [commit("aaa1111", "Fix")] }),
			[`${API}/commits/aaa1111`]: () => new Response(diffFor("fix")),
		});

		const walkthrough = await fetchReleaseChapters({
			owner: "o",
			repo: "r",
			base: "v1.0.0",
			head: "main",
		});

		expect(walkthrough.card).toEqual({ title: "v1.0.0...main" });
		expect(walkthrough.chapters).toHaveLength(1);
		expect(calls.some((url) => url.includes("/releases/"))).toBe(false);
	});

	// The caller's guard checked one public repository; a ref must never be able to
	// aim the request at another (fetch folds `..` and `%2e%2e` out of a path).
	it.each([
		["a head", { base: "a", head: "b/../../../../../repos/priv/repo/compare/v1...v2" }],
		["a base", { base: "../../priv/repo/x", head: "main" }],
		["an encoded dot head", { base: "a", head: "%2e%2e/%2e%2e/priv" }],
	])("never leaves the repository it was asked about, through %s", async (_case, range) => {
		const calls = github({});
		await expect(fetchReleaseChapters({ owner: "pub", repo: "repo", ...range })).rejects.toThrow();
		for (const call of calls) {
			expect(new URL(call).pathname.startsWith("/repos/pub/repo/")).toBe(true);
		}
	});

	it("never leaves the repository through a release tag either", async () => {
		const calls = github({});
		await expect(
			fetchReleaseChapters({ owner: "pub", repo: "repo", tag: "v1/../../../../repos/priv/repo" }),
		).rejects.toThrow();
		for (const call of calls) {
			expect(new URL(call).pathname.startsWith("/repos/pub/repo/")).toBe(true);
		}
	});

	it("says a missing or private repository in one sentence", async () => {
		github({});
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"Release not found (or the repository is private)",
		);
	});

	it("says a tag absent from the repository is not found", async () => {
		github({ [`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v3.0.0" }]) });
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow("Release not found");
	});

	it("says the rate limit, with a way out that is not a whole-change import", async () => {
		github({ [`${API}/tags?per_page=100&page=1`]: () => json({}, 403) });
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"GitHub rate limit hit: try again later",
		);
	});

	it("asks for a smaller range when GitHub will not compare this one", async () => {
		github({
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: () => json({ message: "Server Error" }, 500),
		});
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"GitHub will not compare a range this large: pass a smaller range",
		);
	});

	it("plays a release past 30 commits as one change behind its card, and says so", async () => {
		const commits = [
			...Array.from({ length: 45 }, (_, index) => commit(`c${index}abcdef`, "Work")),
			commit("mmm2222", "Merge pull request #9", 2),
		];
		const calls = github({
			[`${API}/releases/tags/v1.2.0`]: () => json({ name: "Faster imports", body: "" }),
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: (accept) =>
				asDiff(accept) ? new Response(diffFor("whole")) : json({ total_commits: 46, commits }),
		});

		const walkthrough = await fetchReleaseChapters(RELEASE);

		expect(walkthrough.card).toEqual({ title: "Faster imports" });
		// Untitled: the range plays as one change, not as a chapter of one.
		expect(walkthrough.chapters).toEqual([{ title: "", diffText: diffFor("whole") }]);
		// GitHub's own count, the one the release page shows.
		expect(walkthrough.notice).toBe("46 commits, shown as one change");
		expect(calls).toContain(`${API}/compare/v1.1.0...v1.2.0 (diff)`);
		expect(calls.some((url) => url.startsWith(`${API}/commits/`))).toBe(false);
	});

	it("plays a compare link past 30 commits as one change too", async () => {
		// GitHub lists 250 commits of a range at most; the rest only count.
		const commits = Array.from({ length: 250 }, (_, index) => commit(`c${index}abcdef`, "Work"));
		github({
			[`${API}/compare/v1.0.0...main`]: (accept) =>
				asDiff(accept) ? new Response(diffFor("whole")) : json({ total_commits: 612, commits }),
		});

		const walkthrough = await fetchReleaseChapters({
			owner: "o",
			repo: "r",
			base: "v1.0.0",
			head: "main",
		});

		expect(walkthrough.chapters).toEqual([{ title: "", diffText: diffFor("whole") }]);
		expect(walkthrough.notice).toBe("612 commits, shown as one change");
	});

	it("asks for a smaller range when GitHub will not serve the whole change", async () => {
		const commits = Array.from({ length: 31 }, (_, index) => commit(`c${index}abcdef`, "Work"));
		github({
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: (accept) =>
				asDiff(accept)
					? json({ message: "diff too large" }, 406)
					: json({ total_commits: 31, commits }),
		});
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"GitHub will not compare a range this large: pass a smaller range",
		);
	});

	it("asks for a compare link when the first tag's history runs past 30 commits", async () => {
		const history = Array.from({ length: 31 }, (_, index) => commit(`c${index}abcdef`, "Work"));
		github({
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }]),
			[`${API}/commits?sha=v1.2.0&per_page=31`]: () => json(history),
		});
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"v1.2.0 is the first tag and its history runs past 30 commits, with no tag before it to compare with: pass a compare link",
		);
	});
});
