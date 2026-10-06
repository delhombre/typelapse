import {
	fetchCommitDiff,
	fetchPrChapters,
	fetchPrWalkthrough,
} from "@/infrastructure/import/pr-import";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Every way a GitHub fetch can fail must end in a sentence the user can act on.
 * Before this, a network failure surfaced the browser's "Failed to fetch", an
 * empty diff (a merge commit) told someone who pasted a link to "paste a diff
 * first", and a too-large diff was only "Could not fetch the change".
 */

const PR = { owner: "o", repo: "r", number: 7 };
const COMMIT = { owner: "o", repo: "r", sha: "abcdef1234567" };

function respondWith(handler: (url: string) => Response | Promise<Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("GitHub import failures", () => {
	it("explains a network failure instead of echoing the browser", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow("Could not reach GitHub");
	});

	it("mentions a private repository on a 404", async () => {
		respondWith(() => new Response("{}", { status: 404 }));
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow(
			"PR not found (or the repository is private)",
		);
		await expect(fetchCommitDiff(COMMIT)).rejects.toThrow(
			"Commit not found (or the repository is private)",
		);
	});

	it("keeps the rate-limit hint", async () => {
		respondWith(() => new Response("{}", { status: 403 }));
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow("GitHub rate limit hit");
	});

	it("says when GitHub refuses a diff for its size", async () => {
		respondWith(() => new Response("{}", { status: 406 }));
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow("will not serve a diff this large");
	});

	it("tells a GitHub failure on a pull request's diff that the diff can be pasted", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
				(init?.headers as Record<string, string>).Accept === "application/vnd.github.diff"
					? new Response("", { status: 500 })
					: Response.json({ title: "A title" }),
			),
		);
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow(
			"Could not fetch the change: paste the diff instead",
		);
	});

	it("names an empty diff for what it is", async () => {
		respondWith((url) =>
			url.includes("/commits/")
				? new Response("", { status: 200 })
				: new Response("{}", { status: 200 }),
		);
		await expect(fetchCommitDiff(COMMIT)).rejects.toThrow("no file differences to animate");
	});

	it("still lets chapter mode skip an empty commit rather than failing the pull request", async () => {
		const diff = [
			"diff --git a/a.ts b/a.ts",
			"--- a/a.ts",
			"+++ b/a.ts",
			"@@ -1 +1 @@",
			"-const a = 1;",
			"+const a = 2;",
			"",
		].join("\n");
		respondWith((url) => {
			if (url.endsWith("/pulls/7/commits")) {
				return Response.json([
					{ sha: "merge000", commit: { message: "Merge main" } },
					{ sha: "real0000", commit: { message: "Change a" } },
				]);
			}
			if (url.endsWith("/commits/merge000")) {
				return new Response("", { status: 200 });
			}
			if (url.endsWith("/commits/real0000")) {
				return new Response(diff, { status: 200 });
			}
			return Response.json({ title: "Two commits" });
		});
		const result = await fetchPrChapters(PR);
		expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Merge main", "Change a"]);
	});
});
