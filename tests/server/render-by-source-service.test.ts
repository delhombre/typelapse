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

function service(projects = new MemoryProjectRepository(NOW)) {
	const jobs: HostedRenderJobService = {
		submit: async () => ({ outcome: "accepted", job }),
		status: async () => job,
	};
	return {
		projects,
		submit: (
			source: Parameters<ReturnType<typeof renderBySourceServiceFor>["submit"]>[0]["source"],
		) =>
			renderBySourceServiceFor({ db: database, projects, jobs }).submit({
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
