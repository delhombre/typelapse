import { createHash } from "node:crypto";
import type { AccountUsage, AccountUsagePort } from "@/application/billing/plan-allowance";
import { projectFromDiff } from "@/application/import/diff-project";
import type { ImportFetchers, ImportSource } from "@/application/import/import-source";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import type {
	HostedRenderJob,
	HostedRenderJobService,
} from "@/application/render/hosted-render-job";
import {
	RENDER_SOURCE_DEFAULTS,
	createRenderBySourceService,
	parseRenderSourceOptions,
} from "@/application/render/render-by-source";
import { Plan } from "@/domain/value-objects/plan";
import { describe, expect, it, vi } from "vitest";
import { MemoryProjectRepository } from "./support/memory-project-repository";

/**
 * A source, a plan and a caller become a cloud project of that caller and a
 * hosted render job, or become nothing. The importers, the project store and
 * the job service are the seams; the rules about what is saved, what is asked
 * of the plan and what happens twice are what is tested here.
 */

const NOW = new Date("2026-10-05T12:00:00.000Z");
const CREATOR = Plan.pro();
const OWNER = "account-1";

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
const NEWER_DIFF = DIFF.replace("Hello, ", "Hi, ");
const PR: ImportSource = { kind: "pr", ref: { owner: "octocat", repo: "Hello-World", number: 1 } };
const OPTIONS = RENDER_SOURCE_DEFAULTS;

function job(projectId: string, revision: number): HostedRenderJob {
	return {
		id: `job-for-${projectId}-r${revision}`,
		projectId,
		revision,
		status: "queued",
		createdAt: NOW,
		completedAt: null,
	};
}

type Submitted = Parameters<HostedRenderJobService["submit"]>[0];

function jobs(answer?: (input: Submitted) => ReturnType<HostedRenderJobService["submit"]>) {
	const submitted: Submitted[] = [];
	const service: Pick<HostedRenderJobService, "submit"> = {
		submit: async (input) => {
			submitted.push(input);
			return answer
				? answer(input)
				: { outcome: "accepted", job: job(input.projectId, input.revision) };
		},
	};
	return { service, submitted };
}

const IDLE: AccountUsage = {
	cloudProjects: 0,
	mediaBytes: 0,
	hostedRenderMsThisMonth: 0,
	activeRenders: 0,
};

function harness(
	options: {
		usage?: Partial<AccountUsage>;
		fetchers?: Partial<ImportFetchers>;
		submit?: (input: Submitted) => ReturnType<HostedRenderJobService["submit"]>;
	} = {},
) {
	const projects = new MemoryProjectRepository(NOW);
	const queue = jobs(options.submit);
	const usageFor = vi.fn(async () => ({ ...IDLE, ...options.usage }));
	const usage: AccountUsagePort = { usageFor };
	const fetchers: ImportFetchers = {
		fetchPr: vi.fn(async () => ({ diffText: DIFF, title: "Trim the name" })),
		fetchCommit: vi.fn(async () => ({ diffText: DIFF, title: "trim before greeting" })),
		fetchRelease: vi.fn(async () => ({
			card: { title: "Friendlier greetings", subtitle: "The name is trimmed first." },
			chapters: [{ title: "trim before greeting", diffText: DIFF }],
		})),
		...options.fetchers,
	};
	const service = createRenderBySourceService({
		projects,
		jobs: queue.service,
		usage,
		fetchers,
		hash: (value) => createHash("sha256").update(value).digest("hex"),
	});
	const submit = (
		input: Partial<Parameters<typeof service.submit>[0]> = {},
	): ReturnType<typeof service.submit> =>
		service.submit({
			ownerId: OWNER,
			plan: CREATOR,
			source: PR,
			renderOptions: OPTIONS,
			now: NOW,
			...input,
		});
	return { projects, queue, usageFor, fetchers, submit };
}

describe("a source becomes a cloud project and a render job", () => {
	it("saves the import as the caller's project and queues a render of that revision", async () => {
		const { projects, queue, submit } = harness();

		const result = await submit();

		expect(projects.records.size).toBe(1);
		const [saved] = [...projects.records.values()];
		expect(saved).toMatchObject({ ownerId: OWNER, revision: 1 });
		expect(saved?.id).toMatch(/^import_[0-9a-f]{32}$/);
		expect(queue.submitted).toEqual([
			{
				ownerId: OWNER,
				projectId: saved?.id,
				revision: 1,
				renderOptions: OPTIONS,
				plan: CREATOR,
				now: NOW,
			},
		]);
		expect(result).toEqual({ outcome: "queued", job: job(saved?.id ?? "", 1) });
	});

	it("saves the project the studio and the CLI would build from the same pull request", async () => {
		const { projects, submit } = harness();

		await submit();

		const [saved] = [...projects.records.values()];
		const expected = migrateV1ToV2(projectFromDiff(DIFF, { title: "Trim the name" }));
		expect(saved?.document).toEqual({
			...expected,
			project: { ...expected.project, id: saved?.id },
		});
	});

	it("puts a release's title card on the first scene and passes its notice on", async () => {
		const { projects, submit } = harness({
			fetchers: {
				fetchRelease: async () => ({
					card: { title: "Friendlier greetings", subtitle: "The name is trimmed first." },
					chapters: [{ title: "trim before greeting", diffText: DIFF }],
					notice: "v1.0.0 is the first tag, so the video runs from the first commit",
				}),
			},
		});

		const result = await submit({
			source: { kind: "release", ref: { owner: "o", repo: "r", tag: "v1.0.0" } },
		});

		const [saved] = [...projects.records.values()];
		const [first] = saved?.document.project.scenes ?? [];
		expect(first?.blocks.map((block) => block.kind)).toEqual(["text", "text"]);
		expect(saved?.document.project.title).toBe("Friendlier greetings");
		expect(result).toMatchObject({
			outcome: "queued",
			notice: "v1.0.0 is the first tag, so the video runs from the first commit",
		});
	});

	it("builds a diff without asking GitHub anything", async () => {
		const { fetchers, projects, submit } = harness();

		const result = await submit({ source: { kind: "diff", text: DIFF } });

		expect(result.outcome).toBe("queued");
		expect(fetchers.fetchPr).not.toHaveBeenCalled();
		expect([...projects.records.values()][0]?.document.project.title).toBe("greet.ts");
	});
});

describe("the same source twice", () => {
	it("is one project, one revision and one request for the job", async () => {
		const { projects, queue, submit } = harness();

		const first = await submit();
		const second = await submit();

		expect(projects.records.size).toBe(1);
		expect(projects.creates).toBe(1);
		expect(projects.updates).toBe(0);
		expect(queue.submitted.map(({ projectId, revision }) => [projectId, revision])).toEqual([
			[queue.submitted[0]?.projectId, 1],
			[queue.submitted[0]?.projectId, 1],
		]);
		expect(second).toEqual(first);
	});

	it("is a new revision of the same project when the source has changed since", async () => {
		const answers = [DIFF, NEWER_DIFF];
		const { projects, queue, submit } = harness({
			fetchers: { fetchPr: async () => ({ diffText: answers.shift() ?? "", title: "Trim" }) },
		});

		await submit();
		const result = await submit();

		expect(projects.records.size).toBe(1);
		const [saved] = [...projects.records.values()];
		expect(saved?.revision).toBe(2);
		expect(JSON.stringify(saved?.document)).toContain("Hi, ");
		expect(queue.submitted.map((input) => input.revision)).toEqual([1, 2]);
		expect(result).toMatchObject({ outcome: "queued", job: { revision: 2 } });
	});

	it("gives another account its own project for the same pull request", async () => {
		const { projects, submit } = harness();

		await submit();
		await submit({ ownerId: "account-2" });

		expect(projects.records.size).toBe(2);
		expect(new Set([...projects.records.keys()]).size).toBe(2);
	});

	it("meets the project a rival request has just created, instead of failing on it", async () => {
		const rival = harness();
		await rival.submit();
		const { projects, queue, submit } = harness();
		projects.failNextCreate = new Error("duplicate key value violates unique constraint");
		projects.beforeCreateFails = () => {
			for (const [id, row] of rival.projects.records) {
				projects.records.set(id, row);
			}
		};

		const result = await submit();

		expect(result.outcome).toBe("queued");
		expect(projects.records.size).toBe(1);
		expect(queue.submitted.map((input) => input.revision)).toEqual([1]);
	});

	it("does not hide a failure that no rival explains", async () => {
		const { projects, submit } = harness();
		projects.failNextCreate = new Error("connection refused");

		await expect(submit()).rejects.toThrow("connection refused");
	});

	it("looks again when a rival moved the revision first, and saves on top of it", async () => {
		const answers = [DIFF, NEWER_DIFF];
		const { projects, queue, submit } = harness({
			fetchers: { fetchPr: async () => ({ diffText: answers.shift() ?? "", title: "Trim" }) },
		});
		await submit();
		projects.staleNextUpdate = true;

		const result = await submit();

		expect([...projects.records.values()][0]?.revision).toBe(3);
		expect(queue.submitted.map((input) => input.revision)).toEqual([1, 3]);
		expect(result).toMatchObject({ outcome: "queued", job: { revision: 3 } });
	});
});

describe("a request over the plan creates nothing", () => {
	it("is refused at the project ceiling, with the project count it hit", async () => {
		const { projects, queue, submit } = harness();
		for (let index = 0; index < 100; index += 1) {
			const base = migrateV1ToV2(projectFromDiff(DIFF, { title: `Project ${index}` }));
			projects.records.set(`project-${index}`, {
				id: `project-${index}`,
				ownerId: OWNER,
				revision: 1,
				document: { ...base, project: { ...base.project, id: `project-${index}` } },
				createdAt: NOW,
				updatedAt: NOW,
			});
		}

		const result = await submit();

		expect(result).toEqual({ outcome: "plan-limit", ceiling: "cloudProjects", used: 100 });
		expect(projects.records.size).toBe(100);
		expect(queue.submitted).toEqual([]);
	});

	it("is refused past the month's hosted minutes, before anything is saved", async () => {
		const { projects, queue, submit } = harness({ usage: { hostedRenderMsThisMonth: 3_599_000 } });

		const result = await submit();

		expect(result).toEqual({
			outcome: "plan-limit",
			ceiling: "hostedRenderTime",
			used: 3_599_000,
		});
		expect(projects.records.size).toBe(0);
		expect(queue.submitted).toEqual([]);
	});

	it("counts the minutes to the millisecond, as the job queue does", async () => {
		// The greet diff plays for 3,050 ms: two steps of 1,200 and one 650 ms morph.
		const fits = harness({ usage: { hostedRenderMsThisMonth: 3_600_000 - 3_050 } });
		const crosses = harness({ usage: { hostedRenderMsThisMonth: 3_600_000 - 3_049 } });

		expect((await fits.submit({ source: { kind: "diff", text: DIFF } })).outcome).toBe("queued");
		expect(await crosses.submit({ source: { kind: "diff", text: DIFF } })).toMatchObject({
			outcome: "plan-limit",
			ceiling: "hostedRenderTime",
		});
	});

	it("is refused at the number of renders already running, before anything is saved", async () => {
		const { projects, queue, submit } = harness({ usage: { activeRenders: 3 } });

		const result = await submit();

		expect(result).toEqual({ outcome: "plan-limit", ceiling: "concurrentRenders", used: 3 });
		expect(projects.records.size).toBe(0);
		expect(queue.submitted).toEqual([]);
	});

	it("is refused a size the plan does not cover, in the plan's words, before anything is saved", async () => {
		const { projects, queue, submit } = harness();

		const result = await submit({ renderOptions: { ...OPTIONS, width: 3840, height: 3840 } });

		expect(result).toEqual({
			outcome: "resolution-limit",
			message: "Creator renders up to 3840×2160 in either orientation, and 3840×3840 is larger",
		});
		expect(projects.records.size).toBe(0);
		expect(queue.submitted).toEqual([]);
	});

	it("still answers with the job of a render it already accepted, past the minutes", async () => {
		const quiet = harness();
		const first = await quiet.submit();
		const { projects, queue, submit } = harness({
			usage: { hostedRenderMsThisMonth: 3_600_000, activeRenders: 3 },
		});
		for (const [id, row] of quiet.projects.records) {
			projects.records.set(id, row);
		}

		const again = await submit();

		// The job queue is the judge of a resubmission: it returns the job it already holds.
		expect(queue.submitted).toHaveLength(1);
		expect(again).toEqual(first);
		expect(projects.updates).toBe(0);
	});

	it("keeps the project and names the ceiling when the job queue refuses after the save", async () => {
		const { projects, submit } = harness({
			submit: async () => ({ outcome: "plan-limit", ceiling: "concurrentRenders", used: 3 }),
		});

		const result = await submit();

		// Only a request that raced this one gets here. Deleting the project would
		// delete, by cascade, any job the rival queued on it, so it is kept.
		expect(result).toEqual({ outcome: "plan-limit", ceiling: "concurrentRenders", used: 3 });
		expect(projects.records.size).toBe(1);
	});

	it("passes the job queue's own size refusal on", async () => {
		const { submit } = harness({
			submit: async () => ({ outcome: "resolution-limit", message: "Creator renders up to 4K" }),
		});

		expect(await submit()).toEqual({
			outcome: "resolution-limit",
			message: "Creator renders up to 4K",
		});
	});

	it.each([
		["a project that was deleted meanwhile", { outcome: "project-not-found" }],
		["a revision that moved meanwhile", { outcome: "revision-conflict", currentRevision: 9 }],
	] as const)("tells the caller to ask again for %s", async (_case, answer) => {
		const { submit } = harness({ submit: async () => answer });

		expect(await submit()).toEqual({ outcome: "conflict" });
	});
});

describe("a source that cannot be read creates nothing", () => {
	/** One sentence: no line break, no full stop but the one that would end it. */
	function oneSentence(message: string) {
		expect(message).not.toContain("\n");
		expect(message.endsWith(".")).toBe(false);
		expect(message).not.toMatch(/[.!?]\s/);
	}

	it("says a pull request that is not found, or private, in public-only words", async () => {
		const fetchPr = vi.fn(async () =>
			Promise.reject(new Error("PR not found (or the repository is private)")),
		);
		const { projects, queue, usageFor, submit } = harness({ fetchers: { fetchPr } });

		const result = await submit();

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "not-found",
			message:
				"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		});
		oneSentence(result.outcome === "source-refused" ? result.message : "");
		expect(fetchPr).toHaveBeenCalledTimes(1);
		expect(projects.records.size).toBe(0);
		expect(usageFor).not.toHaveBeenCalled();
		expect(queue.submitted).toEqual([]);
	});

	it.each([
		[
			{ kind: "release", ref: { owner: "o", repo: "r", tag: "v1" } } as const,
			"Release not found (or the repository is private)",
			"That release was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		],
		[
			{ kind: "commit", ref: { owner: "o", repo: "r", sha: "7fd1a60" } } as const,
			"Commit not found (or the repository is private)",
			"That commit was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		],
		[
			PR,
			"GitHub rate limit hit: paste the diff instead",
			"GitHub's rate limit was hit; try again later, or send a diff as the source",
		],
		[
			PR,
			"GitHub will not serve a diff this large: paste a smaller diff instead",
			"GitHub will not serve a diff this large; send a smaller diff as the source",
		],
		[
			{ kind: "compare", ref: { owner: "o", repo: "r", base: "a", head: "b" } } as const,
			"GitHub will not compare a range this large: pass a smaller range",
			"GitHub will not compare a range this large; send a smaller range as a compare link",
		],
		[
			PR,
			"Request timed out",
			"GitHub did not answer within 10 seconds; try again, or send a diff as the source",
		],
		[
			PR,
			"Could not reach GitHub: check your connection, or paste the diff instead",
			"Typelapse could not reach GitHub; try again, or send a diff as the source",
		],
		[
			PR,
			"This change has no file differences to animate",
			"That pull request could not be animated: this change has no file differences to animate",
		],
		[PR, "", "That pull request could not be fetched from GitHub"],
		[PR, "Could not fetch the change", "That pull request could not be fetched from GitHub"],
	])("says %j failing with %j as one sentence", async (source, thrown, sentence) => {
		const refuse = async () => Promise.reject(new Error(thrown));
		const { submit } = harness({
			fetchers: { fetchPr: refuse, fetchCommit: refuse, fetchRelease: refuse },
		});

		const result = await submit({ source });

		expect(result).toMatchObject({ outcome: "source-refused", message: sentence });
		oneSentence(result.outcome === "source-refused" ? result.message : "");
	});

	it("says a diff with nothing to animate in the importer's words", async () => {
		const { projects, submit } = harness();

		const result = await submit({
			source: { kind: "diff", text: "diff --git a/logo.png b/logo.png" },
		});

		expect(result).toEqual({
			outcome: "source-refused",
			failure: "other",
			message:
				"That diff could not be animated: this diff only changes binary files, renames or modes: there is no code to animate",
		});
		expect(projects.records.size).toBe(0);
	});
});

describe("parseRenderSourceOptions", () => {
	it("is the studio's own render of an import when nothing is asked", () => {
		expect(parseRenderSourceOptions(undefined)).toEqual({
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: true,
		});
	});

	it("starts from the size and rate the studio gives an imported project", () => {
		const imported = projectFromDiff(DIFF);

		expect(RENDER_SOURCE_DEFAULTS).toMatchObject({
			width: imported.width,
			height: imported.height,
			fps: imported.fps ?? 60,
		});
	});

	it("takes what the caller changes and keeps the rest", () => {
		expect(parseRenderSourceOptions({ format: "webm", fps: 30, loop: true })).toEqual({
			format: "webm",
			width: 1920,
			height: 1080,
			fps: 30,
			includeAudio: true,
			loop: true,
		});
		expect(parseRenderSourceOptions({ width: 1280, height: 720 })).toMatchObject({
			width: 1280,
			height: 720,
		});
	});

	it.each([
		[{ width: 1280 }, "Send width and height together"],
		[{ height: 720 }, "Send width and height together"],
		[{ format: "gif" }, "Unsupported hosted render format"],
		[{ fps: 25 }, "Hosted render fps must be 24, 30 or 60"],
		[{ width: 1281, height: 720 }, "Unsupported hosted render dimensions"],
		[{ loop: "yes" }, "Hosted render loop must be boolean"],
		["mp4", "Render options must be an object"],
		[["mp4"], "Render options must be an object"],
	])("refuses %j with %j", (input, message) => {
		expect(() => parseRenderSourceOptions(input)).toThrow(message);
	});
});
