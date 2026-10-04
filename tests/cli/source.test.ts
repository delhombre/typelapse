// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectFromDiff } from "@/application/import/diff-project";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../cli/errors";
import {
	type SourceDeps,
	applyOverrides,
	githubFetch,
	resolveSource,
	studioLink,
} from "../../cli/source";
import { expectOneSentence } from "./one-sentence";

/**
 * What the CLI was pointed at, read into the project the studio would hold.
 * The network and the disk are injected: these tests are about the decisions,
 * the real fetch is proven against GitHub in the ticket's report.
 */

const ROOT = resolve(__dirname, "../..");
const DIFF = readFileSync(resolve(__dirname, "fixtures/greet.diff"), "utf8");
const DEMO = JSON.parse(readFileSync(resolve(ROOT, "docs/demo.project.json"), "utf8"));

/** These sources are code; a layered one has no V1 project to read. */
async function resolveCode(arg: string, io: SourceDeps) {
	const source = await resolveSource(arg, io);
	if (!source.project) {
		throw new Error(`${arg} resolved to a layered project`);
	}
	return source;
}

function deps(overrides: Partial<SourceDeps> = {}): SourceDeps {
	return {
		cwd: ROOT,
		readText: async (path) => readFileSync(path, "utf8"),
		readStdin: async () => DIFF,
		fetchPr: vi.fn(async () => ({ diffText: DIFF, title: "Trim the name" })),
		fetchCommit: vi.fn(async () => ({ diffText: DIFF, title: "trim before greeting" })),
		fetchRelease: vi.fn(async () => ({
			card: { title: "Friendlier greetings", subtitle: "The name is trimmed first." },
			chapters: [{ title: "trim before greeting", diffText: DIFF }],
		})),
		...overrides,
	};
}

async function refusal(promise: Promise<unknown>, exitCode: 2 | 3): Promise<string> {
	const error = await promise.then(
		() => null,
		(caught: unknown) => caught,
	);
	expect(error).toBeInstanceOf(CliError);
	expect((error as CliError).exitCode).toBe(exitCode);
	expectOneSentence((error as CliError).message);
	return (error as CliError).message;
}

describe("resolveSource", () => {
	it("reads a pull request through the studio's own PR import and keeps its title", async () => {
		const io = deps();

		const source = await resolveCode("https://github.com/octocat/Hello-World/pull/1/files", io);

		expect(io.fetchPr).toHaveBeenCalledWith({ owner: "octocat", repo: "Hello-World", number: 1 });
		expect(source.kind).toBe("pr");
		expect(source.project).toEqual(projectFromDiff(DIFF, { title: "Trim the name" }));
	});

	it("reads a commit the same way", async () => {
		const io = deps();

		const source = await resolveCode("github.com/octocat/Hello-World/commit/7fd1a60", io);

		expect(io.fetchCommit).toHaveBeenCalledWith({
			owner: "octocat",
			repo: "Hello-World",
			sha: "7fd1a60",
		});
		expect(source.project.title).toBe("trim before greeting");
	});

	it("reads a diff file relative to where the command was run", async () => {
		const source = await resolveCode("tests/cli/fixtures/greet.diff", deps());

		expect(source.kind).toBe("diff");
		expect(source.project).toEqual(projectFromDiff(DIFF));
	});

	it("reads a diff piped on stdin when the source is -", async () => {
		const source = await resolveCode("-", deps());

		expect(source.project).toEqual(projectFromDiff(DIFF));
	});

	it("reads a project file as written, with nothing filled in", async () => {
		const source = await resolveCode("docs/demo.project.json", deps());

		expect(source.kind).toBe("project");
		expect(source.project).toMatchObject({
			title: DEMO.title,
			themeName: DEMO.themeName,
			width: DEMO.width,
			height: DEMO.height,
			background: DEMO.background,
		});
		expect(source.project.steps.map((step) => step.code)).toEqual(
			DEMO.steps.map((step: { code: string }) => step.code),
		);
	});

	it("rolls a code-only V2 document back to the project the render route reads", async () => {
		const v2 = JSON.stringify(migrateV1ToV2(DEMO));

		const source = await resolveCode("demo.v2.json", deps({ readText: async () => v2 }));

		expect(source.project.steps.map((step) => step.code)).toEqual(
			DEMO.steps.map((step: { code: string }) => step.code),
		);
	});

	it.each([
		["a missing file", "nowhere/change.diff", deps()],
		["a file that is neither", "README.md", deps()],
		["a JSON file that is not a project", "x.json", deps({ readText: async () => "{}" })],
		["a link to another host", "https://gitlab.com/a/b/-/merge_requests/1", deps()],
		["a GitHub link that is not a PR or commit", "https://github.com/octocat/Hello-World", deps()],
	])("refuses %s with exit code 2", async (_case, arg, io) => {
		await refusal(resolveSource(arg, io), 2);
	});

	it.each([
		["PR not found (or the repository is private)", /private/],
		["GitHub rate limit hit: paste the diff instead", /GITHUB_TOKEN/],
		["Could not reach GitHub: check your connection, or paste the diff instead", /connection/],
		["Request timed out", /answer/],
		["This change has no file differences to animate", /no file differences/],
	])("says '%s' as one CLI sentence with exit code 3", async (thrown, said) => {
		const io = deps({ fetchPr: async () => Promise.reject(new Error(thrown)) });

		const message = await refusal(resolveSource("https://github.com/o/r/pull/9", io), 3);

		expect(message).toMatch(said);
		expect(message).not.toContain("paste");
	});
});

describe("resolveSource on a release", () => {
	const RELEASE_URL = "https://github.com/octocat/Hello-World/releases/tag/v1.2.0";

	it("reads a release into its chaptered project, opening on a blank card step", async () => {
		const io = deps();

		const source = await resolveCode(RELEASE_URL, io);

		expect(io.fetchRelease).toHaveBeenCalledWith({
			owner: "octocat",
			repo: "Hello-World",
			tag: "v1.2.0",
		});
		expect(source.kind).toBe("release");
		expect(source.card).toEqual({
			title: "Friendlier greetings",
			subtitle: "The name is trimmed first.",
		});
		expect(source.project.title).toBe("Friendlier greetings");
		expect(source.project.steps[0]?.code).toBe("");
		expect(source.project.steps[1]?.caption).toBe("1/1 · trim before greeting");
	});

	it("reads a compare link the same way", async () => {
		const io = deps();

		const source = await resolveCode("github.com/octocat/Hello-World/compare/v1.1.0...v1.2.0", io);

		expect(io.fetchRelease).toHaveBeenCalledWith({
			owner: "octocat",
			repo: "Hello-World",
			base: "v1.1.0",
			head: "v1.2.0",
		});
		expect(source.kind).toBe("compare");
	});

	it("carries the first-tag notice to the progress line", async () => {
		const io = deps({
			fetchRelease: async () => ({
				card: { title: "v0.1.0" },
				chapters: [{ title: "Initial commit", diffText: DIFF }],
				notice: "v0.1.0 is the first tag, so the video runs from the first commit",
			}),
		});

		const source = await resolveCode(RELEASE_URL, io);

		expect(source.notice).toBe("v0.1.0 is the first tag, so the video runs from the first commit");
	});

	it.each([
		[
			"Release not found (or the repository is private)",
			/^That release was not found.*GITHUB_TOKEN/,
		],
		["GitHub rate limit hit: try again later", /GITHUB_TOKEN/],
		["GitHub will not compare a range this large: pass a smaller range", /pass a smaller range/],
		[
			"This release spans 31 commits, more than the 30 a video chapters: pass a smaller range",
			/31 commits.*pass a smaller range/,
		],
		["These commits contain no changes to animate", /no changes to animate/],
	])("says '%s' as one CLI sentence with exit code 3", async (thrown, said) => {
		const io = deps({ fetchRelease: async () => Promise.reject(new Error(thrown)) });

		const message = await refusal(resolveSource(RELEASE_URL, io), 3);

		expect(message).toMatch(said);
		expect(message).not.toContain("paste");
	});

	it("says an empty release in one sentence too", async () => {
		const io = deps({
			fetchRelease: async () => ({ card: { title: "v1" }, chapters: [] }),
		});

		const message = await refusal(resolveSource(RELEASE_URL, io), 3);

		expect(message).toMatch(/no changes to animate/);
	});

	it("links the studio to the release, which imports it the way the link import does", async () => {
		const source = await resolveCode(RELEASE_URL, deps());

		const link = studioLink(source, source.project, "http://localhost:5173/app");

		const payload = link.split("#import=")[1] ?? "";
		expect(JSON.parse(Buffer.from(payload, "base64").toString("utf8"))).toEqual({
			source: RELEASE_URL,
		});
	});
});

describe("applyOverrides", () => {
	it("swaps the whole theme, as the studio's theme picker does", () => {
		const project = applyOverrides(DEMO, { theme: "nord" });

		expect(project.themeName).toBe("nord");
		expect(project.fontFamily).toBeUndefined();
		expect(project.borderRadius).toBeUndefined();
	});

	it("sets the size the project renders at", () => {
		expect(applyOverrides(DEMO, { size: { width: 1280, height: 720 } })).toMatchObject({
			width: 1280,
			height: 720,
		});
	});

	it("leaves the project alone when nothing is overridden", () => {
		expect(applyOverrides(DEMO, {})).toEqual(DEMO);
	});

	it("refuses a project whose theme the studio does not have", () => {
		expect(() => applyOverrides({ ...DEMO, themeName: "solarized" }, {})).toThrow(CliError);
	});
});

describe("studioLink", () => {
	const decode = (value: string) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

	it("links a pull request by its URL, so the studio imports it the way the landing does", async () => {
		const url = "https://github.com/octocat/Hello-World/pull/1";
		const source = await resolveCode(url, deps());

		const link = studioLink(source, source.project, "http://localhost:5173/app");

		expect(link.startsWith("http://localhost:5173/app#import=")).toBe(true);
		expect(decode(link.split("#import=")[1] ?? "")).toEqual({ source: url });
	});

	it("carries a file's project whole, overrides included, so the studio opens what was rendered", async () => {
		const source = await resolveCode("docs/demo.project.json", deps());
		const project = applyOverrides(source.project, { theme: "nord" });

		const link = studioLink(source, project, "https://studio.example");

		expect(link.startsWith("https://studio.example/app#share=")).toBe(true);
		expect(decode(link.split("#share=")[1] ?? "")).toEqual(project);
	});
});

describe("githubFetch", () => {
	it("signs GitHub API requests with the token and nothing else", async () => {
		const inner = vi.fn(async () => new Response("ok"));
		const signed = githubFetch(inner as unknown as typeof fetch, "t0ken");

		await signed("https://api.github.com/repos/o/r/pulls/1", {
			headers: { Accept: "application/vnd.github.diff" },
		});
		await signed("https://example.com/file.ts");

		const [, githubInit] = inner.mock.calls[0] as unknown as [string, RequestInit];
		const headers = new Headers(githubInit.headers);
		expect(headers.get("Authorization")).toBe("Bearer t0ken");
		expect(headers.get("Accept")).toBe("application/vnd.github.diff");
		const [, otherInit] = inner.mock.calls[1] as unknown as [string, RequestInit | undefined];
		expect(new Headers(otherInit?.headers).get("Authorization")).toBeNull();
	});

	it("is the plain fetch without a token", () => {
		expect(githubFetch(fetch, undefined)).toBe(fetch);
	});
});
