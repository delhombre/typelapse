// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountUsageRepository } from "../../server/db/account-usage.repository";
import { createDatabase } from "../../server/db/database";
import { createProjectDocumentRepository } from "../../server/db/project-document.repository";
import {
	createRenderAssetReadiness,
	createRenderJobRepository,
} from "../../server/db/render-job.repository";
import { user } from "../../server/db/schema";
import type { ImportFetchers, ImportSource } from "../../src/application/import/import-source";
import { createHostedRenderJobService } from "../../src/application/render/hosted-render-job";
import {
	RENDER_SOURCE_DEFAULTS,
	createRenderBySourceService,
} from "../../src/application/render/render-by-source";
import { Plan } from "../../src/domain/value-objects/plan";

/**
 * Render by URL on the real stores. The idempotence the use case promises (the
 * same source is one project, one revision and one job) and the race it meets
 * (two requests creating the same project) are only true if PostgreSQL agrees,
 * so they run against it. They run when TYPELAPSE_TEST_DATABASE_URL names a
 * database, for example the one `tests/e2e/hosted/services.sh up` starts:
 *
 *   TYPELAPSE_TEST_DATABASE_URL=postgres://postgres:typelapse@127.0.0.1:54381/typelapse
 *
 * Each test makes its own account and removes it, which takes its projects and
 * jobs with it.
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;
const NOW = new Date();

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
const PR: ImportSource = { kind: "pr", ref: { owner: "octocat", repo: "Hello-World", number: 1 } };

describe.skipIf(!DATABASE_URL)("render by URL on PostgreSQL", () => {
	const db = createDatabase(DATABASE_URL ?? "postgres://unused");
	const made: string[] = [];
	const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

	beforeAll(async () => {
		await migrate(db, { migrationsFolder: "server/db/migrations" });
	});

	afterAll(async () => {
		for (const id of made) {
			await db.$client.query('DELETE FROM "user" WHERE id = $1', [id]);
		}
		await db.$client.end();
	});

	async function account(label: string): Promise<string> {
		const id = `contract-${label}-${randomBytes(4).toString("hex")}`;
		await db.insert(user).values({ id, name: label, email: `${id}@typelapse.test` });
		made.push(id);
		return id;
	}

	/** What GitHub says the pull request is, changeable between requests. */
	function service(state: { diff: string }) {
		const projects = createProjectDocumentRepository(db);
		const fetchers: ImportFetchers = {
			fetchPr: async () => ({ diffText: state.diff, title: "Trim the name" }),
			fetchCommit: async () => ({ diffText: state.diff, title: "trim" }),
			fetchRelease: async () => {
				throw new Error("not used");
			},
		};
		return createRenderBySourceService({
			projects,
			jobs: createHostedRenderJobService({
				projects,
				assets: createRenderAssetReadiness(db),
				jobs: createRenderJobRepository(db),
				compilerVersion: "contract",
				hashOptions: sha256,
			}),
			usage: createAccountUsageRepository(db),
			fetchers,
			hash: sha256,
		});
	}

	const counts = async (ownerId: string) => {
		const projects = await db.$client.query(
			"SELECT id, revision FROM projects WHERE owner_id = $1 ORDER BY id",
			[ownerId],
		);
		const jobs = await db.$client.query(
			"SELECT id, revision FROM render_jobs WHERE owner_id = $1 ORDER BY id",
			[ownerId],
		);
		return { projects: projects.rows, jobs: jobs.rows };
	};

	const submit = (
		rendering: ReturnType<typeof service>,
		ownerId: string,
		source: ImportSource = PR,
	) =>
		rendering.submit({
			ownerId,
			plan: Plan.pro(),
			source,
			renderOptions: RENDER_SOURCE_DEFAULTS,
			now: NOW,
		});

	it("is one project, one revision and one job however often the same source is sent", async () => {
		const owner = await account("twice");
		const rendering = service({ diff: DIFF });

		const first = await submit(rendering, owner);
		const second = await submit(rendering, owner);

		expect(first.outcome).toBe("queued");
		expect(second).toEqual(first);
		const { projects, jobs } = await counts(owner);
		expect(projects).toHaveLength(1);
		expect(projects[0]).toMatchObject({ revision: 1 });
		expect(jobs).toHaveLength(1);
	});

	it("is the next revision of the same project, and a new job, once the source has changed", async () => {
		const owner = await account("changed");
		const state = { diff: DIFF };
		const rendering = service(state);
		const first = await submit(rendering, owner);

		state.diff = DIFF.replace("Hello, ", "Hi, ");
		const second = await submit(rendering, owner);

		expect(first).toMatchObject({ outcome: "queued", job: { revision: 1 } });
		expect(second).toMatchObject({ outcome: "queued", job: { revision: 2 } });
		if (first.outcome !== "queued" || second.outcome !== "queued") throw new Error("expected jobs");
		expect(second.job.projectId).toBe(first.job.projectId);
		expect(second.job.id).not.toBe(first.job.id);
		const stored = await db.$client.query(
			"SELECT revision, document::text AS document FROM projects WHERE owner_id = $1",
			[owner],
		);
		expect(stored.rows).toHaveLength(1);
		expect(stored.rows[0]?.revision).toBe(2);
		expect(stored.rows[0]?.document).toContain("Hi, ");
		expect((await counts(owner)).jobs).toHaveLength(2);
	});

	it("ends with one project and one job when the same request arrives many times at once", async () => {
		const owner = await account("racing");
		const rendering = service({ diff: DIFF });

		// Enough at once that several meet "no project yet" together, whatever the pool's warmth.
		const results = await Promise.all(Array.from({ length: 12 }, () => submit(rendering, owner)));

		expect(new Set(results.map((result) => result.outcome))).toEqual(new Set(["queued"]));
		const ids = results.map((result) => (result.outcome === "queued" ? result.job.id : ""));
		expect(new Set(ids).size).toBe(1);
		const { projects, jobs } = await counts(owner);
		expect(projects).toHaveLength(1);
		expect(jobs).toHaveLength(1);
	});

	it("gives two accounts their own project for the same source", async () => {
		const [one, other] = [await account("one"), await account("other")];
		const rendering = service({ diff: DIFF });

		await submit(rendering, one);
		await submit(rendering, other);

		expect((await counts(one)).projects).toHaveLength(1);
		expect((await counts(other)).projects).toHaveLength(1);
		expect((await counts(one)).projects[0]?.id).not.toBe((await counts(other)).projects[0]?.id);
	});

	it("is refused past the month's minutes without writing a project or a job", async () => {
		const owner = await account("minutes");
		const rendering = service({ diff: DIFF });
		await submit(rendering, owner);
		await db.$client.query("UPDATE render_jobs SET duration_ms = $2 WHERE owner_id = $1", [
			owner,
			3_600_000 - 1_000,
		]);
		const before = await counts(owner);

		const refused = await submit(rendering, owner, {
			kind: "diff",
			text: DIFF.replace("Hello,", "Bye,"),
		});

		expect(refused).toEqual({
			outcome: "plan-limit",
			ceiling: "hostedRenderTime",
			used: 3_600_000 - 1_000,
		});
		expect(await counts(owner)).toEqual(before);
	});
});
