// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatorDatabase } from "../../server/db/database";
import { renderBySourceServiceFor } from "../../server/render/render-by-source-service";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import { RENDER_SOURCE_DEFAULTS } from "../../src/application/render/render-by-source";
import { Plan } from "../../src/domain/value-objects/plan";
import { MemoryProjectRepository } from "../application/support/memory-project-repository";

/**
 * Render by URL as this server wires it: the studio's own GitHub importers, a
 * fake GitHub behind them. What GitHub is sent is the point: a request that
 * carries no credential can only ever be answered with what anyone can read,
 * which is how a private repository stays out of reach.
 */

const NOW = new Date("2026-10-05T12:00:00.000Z");
const GREET_DIFF = `diff --git a/src/greet.ts b/src/greet.ts
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

/** The usage query's answer: an account with nothing running and nothing spent. */
const database = {
	execute: async () => ({
		rows: [{ cloudProjects: 0, mediaBytes: 0, hostedRenderMs: 0, activeRenders: 0 }],
	}),
} as unknown as CreatorDatabase;

const job = {
	id: "job-1",
	projectId: "project",
	revision: 1,
	status: "queued" as const,
	createdAt: NOW,
	completedAt: null,
};

function service(
	projects = new MemoryProjectRepository(NOW),
	options: { githubToken?: string; readBudgetMs?: number } = {},
) {
	const jobs: HostedRenderJobService = {
		submit: async () => ({ outcome: "accepted", job }),
		status: async () => job,
	};
	return {
		projects,
		submit: (
			source: Parameters<ReturnType<typeof renderBySourceServiceFor>["submit"]>[0]["source"],
		) =>
			renderBySourceServiceFor({ db: database, projects, jobs, ...options }).submit({
				ownerId: "account-1",
				plan: Plan.pro(),
				source,
				renderOptions: RENDER_SOURCE_DEFAULTS,
				now: NOW,
			}),
	};
}

interface Sent {
	readonly url: URL;
	readonly headers: Headers;
}

/** GitHub, as far as a test needs it, recording what it was asked and how. */
function fakeGitHub(answer: (url: URL, accept: string) => Response) {
	const sent: Sent[] = [];
	vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
		);
		const headers = new Headers(init?.headers);
		sent.push({ url, headers });
		return answer(url, headers.get("accept") ?? "");
	});
	return sent;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("a pull request read from GitHub", () => {
	const PR = { kind: "pr", ref: { owner: "acme", repo: "widgets", number: 42 } } as const;

	it("is saved under its own title, from a read that carries no credential", async () => {
		const sent = fakeGitHub((url, accept) => {
			if (url.pathname !== "/repos/acme/widgets/pulls/42") {
				return new Response("{}", { status: 404 });
			}
			return accept === "application/vnd.github.diff"
				? new Response(GREET_DIFF)
				: Response.json({ title: "Trim names before greeting" });
		});
		const { projects, submit } = service();

		const result = await submit(PR);

		expect(result.outcome).toBe("queued");
		const [saved] = [...projects.records.values()];
		expect(saved?.id).toMatch(/^import_[0-9a-f]{32}$/);
		expect(saved?.document.project.title).toBe("Trim names before greeting");
		expect(saved?.document.project.scenes).toHaveLength(2);
		expect(sent.map((request) => request.url.origin)).toEqual([
			"https://api.github.com",
			"https://api.github.com",
		]);
		for (const request of sent) {
			expect([...request.headers.keys()]).toEqual(["accept"]);
		}
	});

	it("is refused as not found, or private, when GitHub shows nothing at that address", async () => {
		const sent = fakeGitHub(() => new Response("{}", { status: 404 }));
		const { projects, submit } = service();

		const result = await submit(PR);

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "not-found",
			message:
				"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		});
		expect(projects.records.size).toBe(0);
		// A token would have changed GitHub's answer for a private repository. None is sent.
		for (const request of sent) {
			expect(request.headers.has("authorization")).toBe(false);
		}
	});

	it("is refused as one sentence when GitHub's anonymous quota is spent", async () => {
		fakeGitHub(() => new Response("{}", { status: 403 }));
		const { projects, submit } = service();

		const result = await submit(PR);

		expect(result).toMatchObject({ outcome: "source-refused", failure: "rate-limit" });
		expect(projects.records.size).toBe(0);
	});
});

describe("a commit read from GitHub", () => {
	it("is saved under the first line of its message", async () => {
		fakeGitHub((url, accept) => {
			if (url.pathname !== "/repos/acme/widgets/commits/7fd1a60") {
				return new Response("{}", { status: 404 });
			}
			return accept === "application/vnd.github.diff"
				? new Response(GREET_DIFF)
				: Response.json({ commit: { message: "trim before greeting\n\nLonger body." } });
		});
		const { projects, submit } = service();

		await submit({ kind: "commit", ref: { owner: "acme", repo: "widgets", sha: "7fd1a60" } });

		expect([...projects.records.values()][0]?.document.project.title).toBe("trim before greeting");
	});
});

describe("with a GitHub token on this server", () => {
	const PR = { kind: "pr", ref: { owner: "acme", repo: "widgets", number: 42 } } as const;
	const TOKEN = "github_pat_fine_grained";

	/** GitHub, as it answers a token: a pull request's diff and title, for a repository of any kind. */
	const answers = (isPrivate: boolean) => (url: URL, accept: string) => {
		if (url.pathname === "/repos/acme/widgets") {
			return Response.json({ private: isPrivate });
		}
		return accept === "application/vnd.github.diff"
			? new Response(GREET_DIFF)
			: Response.json({ title: "Trim names before greeting" });
	};

	it("signs every read of a public repository with it", async () => {
		const sent = fakeGitHub(answers(false));
		const { projects, submit } = service(undefined, { githubToken: TOKEN });

		const result = await submit(PR);

		expect(result.outcome).toBe("queued");
		expect(projects.records.size).toBe(1);
		expect(sent.length).toBeGreaterThan(1);
		for (const request of sent) {
			expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
		}
	});

	it("refuses a private repository the token could read, as a repository nobody sees", async () => {
		const sent = fakeGitHub(answers(true));
		const { projects, submit } = service(undefined, { githubToken: TOKEN });

		const result = await submit(PR);

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "not-found",
			message:
				"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		});
		expect(projects.records.size).toBe(0);
		// The token was used once, on the repository's own record, and read nothing of the pull request.
		expect(sent.map((request) => request.url.pathname)).toEqual(["/repos/acme/widgets"]);
	});

	it("refuses the same private repository without a token, in the same words", async () => {
		fakeGitHub(() => new Response("{}", { status: 404 }));
		const { submit } = service();

		await expect(submit(PR)).resolves.toMatchObject({
			outcome: "source-refused",
			failure: "not-found",
		});
	});

	it("names GitHub's limit when it is spent, whatever the token's", async () => {
		fakeGitHub(
			(url) =>
				url.pathname === "/repos/acme/widgets"
					? Response.json({ private: false })
					: new Response("{}", {
							status: 403,
							headers: {
								"x-ratelimit-limit": "5000",
								"x-ratelimit-remaining": "0",
								"x-ratelimit-reset": "1791000000",
							},
						}),
		);
		const { projects, submit } = service(undefined, { githubToken: TOKEN });

		const result = await submit(PR);

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "rate-limit",
			message:
				"GitHub's rate limit was hit (0 of 5000 requests left, resets at 04:00 UTC); try again later, or send a diff as the source",
		});
		expect(projects.records.size).toBe(0);
	});
});

describe("a source GitHub reads slowly", () => {
	const RELEASE = { kind: "release", ref: { owner: "acme", repo: "widgets", tag: "v2.0.0" } } as const;

	/** A GitHub that holds every request open until the caller gives up on it. */
	function stalledGitHub() {
		const open = { requests: 0, stopped: 0 };
		vi.stubGlobal(
			"fetch",
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					open.requests += 1;
					init?.signal?.addEventListener("abort", () => {
						open.stopped += 1;
						reject(new DOMException("aborted", "AbortError"));
					});
				}),
		);
		return open;
	}

	it("is refused with the budget named, and the reads it started are stopped", async () => {
		const open = stalledGitHub();
		const { projects, submit } = service(undefined, { readBudgetMs: 200 });

		const result = await submit(RELEASE);

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "budget",
			message:
				"Reading the source took longer than 0.2 seconds; try again, or send a smaller range or a diff as the source",
		});
		expect(projects.records.size).toBe(0);
		expect(open.requests).toBeGreaterThan(0);
		expect(open.stopped).toBe(open.requests);
	});
});
