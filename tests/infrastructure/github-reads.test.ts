import { createGitHubFetchers } from "@/infrastructure/import/github-fetchers";
import { fetchPrChapters, fetchPrWalkthrough } from "@/infrastructure/import/pr-import";
import { fetchReleaseChapters } from "@/infrastructure/import/release-import";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * What a GitHub read sends and what it says when GitHub limits it. A token is
 * optional: with none, a read carries no credential, as it always did. With one,
 * every request carries it, and a repository that is not public is refused before
 * the token reads a byte of it, whatever the token is allowed to see.
 */

const PR = { owner: "acme", repo: "widgets", number: 7 };
const COMMIT = { owner: "acme", repo: "widgets", sha: "abcdef1234567" };
const RELEASE = { owner: "acme", repo: "widgets", tag: "v2.0.0" };

const DIFF = [
	"diff --git a/a.ts b/a.ts",
	"--- a/a.ts",
	"+++ b/a.ts",
	"@@ -1 +1 @@",
	"-const a = 1;",
	"+const a = 2;",
	"",
].join("\n");

interface Sent {
	readonly url: URL;
	readonly headers: Headers;
	readonly signal: AbortSignal | undefined;
}

/** GitHub, answering each request and recording how it was asked. */
function fakeGitHub(answer: (url: URL, accept: string) => Response) {
	const sent: Sent[] = [];
	vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
		);
		const headers = new Headers(init?.headers);
		sent.push({ url, headers, signal: init?.signal ?? undefined });
		return answer(url, headers.get("accept") ?? "");
	});
	return sent;
}

/** A public or a private repository's own record, and a pull request that reads fine. */
function repository(isPrivate: boolean | undefined) {
	return (url: URL, accept: string) => {
		if (url.pathname === "/repos/acme/widgets") {
			return Response.json(isPrivate === undefined ? {} : { private: isPrivate });
		}
		return accept === "application/vnd.github.diff"
			? new Response(DIFF)
			: Response.json({ title: "Bump a" });
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("a read with a token", () => {
	it("signs every request, and an unsigned read stays unsigned", async () => {
		const sent = fakeGitHub(repository(false));

		await fetchPrWalkthrough(PR, { token: "t0ken" });
		await fetchPrWalkthrough(PR);

		const [signed, unsigned] = [sent.slice(0, 2), sent.slice(2)];
		expect(signed).toHaveLength(2);
		for (const request of signed) {
			expect(request.headers.get("authorization")).toBe("Bearer t0ken");
		}
		for (const request of unsigned) {
			expect(request.headers.has("authorization")).toBe(false);
		}
	});

	it("stops at the caller's signal, and holds nothing open once it has fired", async () => {
		vi.stubGlobal(
			"fetch",
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					// What fetch does: a signal already fired rejects at once, a later one when it fires.
					const abort = () => reject(new DOMException("aborted", "AbortError"));
					if (init?.signal?.aborted) {
						abort();
					}
					init?.signal?.addEventListener("abort", abort);
				}),
		);
		const stop = new AbortController();

		const reading = fetchPrWalkthrough(PR, { signal: stop.signal });
		stop.abort();
		await expect(reading).rejects.toThrow("Request timed out");

		// A signal already fired aborts the next request as it starts: nothing is held open.
		await expect(fetchPrWalkthrough(PR, { signal: stop.signal })).rejects.toThrow(
			"Request timed out",
		);
	});
});

describe("a rate limit", () => {
	const limited = () =>
		new Response("{}", {
			status: 403,
			headers: {
				"x-ratelimit-limit": "60",
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset": "1791000000",
			},
		});

	it("is named with what GitHub said of it: the limit, what is left, when it resets", async () => {
		fakeGitHub(limited);
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow(
			"GitHub rate limit hit (0 of 60 requests left, resets at 04:00 UTC): paste the diff instead",
		);
	});

	it("keeps that detail when a pull request's chapters point at the cheaper import", async () => {
		fakeGitHub(limited);
		await expect(fetchPrChapters(PR)).rejects.toThrow(
			"GitHub rate limit hit (0 of 60 requests left, resets at 04:00 UTC): import the whole change instead",
		);
	});

	it("keeps it for a release, which can only try again", async () => {
		fakeGitHub(limited);
		await expect(fetchReleaseChapters(RELEASE)).rejects.toThrow(
			"GitHub rate limit hit (0 of 60 requests left, resets at 04:00 UTC): try again later",
		);
	});

	it("names the wait of a secondary limit, which has no quota to report", async () => {
		fakeGitHub(() => new Response("{}", { status: 429, headers: { "retry-after": "45" } }));
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow(
			"GitHub rate limit hit (retry after 45 seconds): paste the diff instead",
		);
	});

	it("is the old sentence when GitHub sent no headers", async () => {
		fakeGitHub(() => new Response("{}", { status: 403 }));
		await expect(fetchPrWalkthrough(PR)).rejects.toThrow(
			/^GitHub rate limit hit: paste the diff instead$/,
		);
	});
});

describe("the readers a server builds", () => {
	it("read a public repository with the token", async () => {
		const sent = fakeGitHub(repository(false));

		const read = await createGitHubFetchers({ token: "t0ken" }).fetchPr(PR);

		expect(read).toEqual({ diffText: DIFF, title: "Bump a" });
		expect(sent.length).toBeGreaterThan(1);
		for (const request of sent) {
			expect(request.headers.get("authorization")).toBe("Bearer t0ken");
		}
	});

	it.each([
		["a private repository", true],
		["a repository that does not say it is public", undefined],
	])(
		"refuse %s that the token could read, as a repository nobody sees",
		async (_name, isPrivate) => {
			const sent = fakeGitHub(repository(isPrivate));
			const fetchers = createGitHubFetchers({ token: "t0ken" });

			await expect(fetchers.fetchPr(PR)).rejects.toThrow(
				"PR not found (or the repository is private)",
			);
			await expect(fetchers.fetchCommit(COMMIT)).rejects.toThrow(
				"Commit not found (or the repository is private)",
			);
			await expect(fetchers.fetchRelease(RELEASE)).rejects.toThrow(
				"Release not found (or the repository is private)",
			);
			await expect(
				fetchers.fetchRelease({ owner: "acme", repo: "widgets", base: "a", head: "b" }),
			).rejects.toThrow("Comparison not found (or the repository is private)");
			// Only the repository's own record was asked for. Nothing in it was read.
			expect(new Set(sent.map((request) => request.url.pathname))).toEqual(
				new Set(["/repos/acme/widgets"]),
			);
		},
	);

	it("refuse a repository GitHub answers 404 for in the same words", async () => {
		fakeGitHub(() => new Response("{}", { status: 404 }));
		await expect(createGitHubFetchers({ token: "t0ken" }).fetchPr(PR)).rejects.toThrow(
			"PR not found (or the repository is private)",
		);
	});

	it("ask nothing more of GitHub without a token, and send no credential", async () => {
		const sent = fakeGitHub(repository(true));

		await createGitHubFetchers({}).fetchPr(PR);

		expect(sent.map((request) => request.url.pathname)).toEqual([
			"/repos/acme/widgets/pulls/7",
			"/repos/acme/widgets/pulls/7",
		]);
		for (const request of sent) {
			expect([...request.headers.keys()]).toEqual(["accept"]);
		}
	});
});
