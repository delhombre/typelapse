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

/** Route each GitHub URL to a response; anything unrouted is a 404 and is recorded. */
function github(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			calls.push(url);
			const route = routes[url];
			return route ? route() : json({ message: "Not Found" }, 404);
		}),
	);
	return calls;
}

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

	it("asks for a smaller range past the commits a walkthrough can chapter", async () => {
		const commits = Array.from({ length: 31 }, (_, index) => commit(`c${index}abcdef`, "Work"));
		github({
			[`${API}/tags?per_page=100&page=1`]: () => json([{ name: "v1.2.0" }, { name: "v1.1.0" }]),
			[`${API}/compare/v1.1.0...v1.2.0`]: () => json({ total_commits: 31, commits }),
		});
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"This release spans 31 commits, more than the 30 a video chapters: pass a smaller range",
		);
	});
});
