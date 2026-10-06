// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountUsageRepository } from "../../server/db/account-usage.repository";
import { createDatabase } from "../../server/db/database";
import { createProjectDocumentRepository } from "../../server/db/project-document.repository";
import {
	createRenderJobQueue,
	createRenderJobRepository,
} from "../../server/db/render-job.repository";
import { user } from "../../server/db/schema";
import { allowanceSentence } from "../../src/application/billing/plan-allowance";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import { Plan } from "../../src/domain/value-objects/plan";

/**
 * The month's hosted usage on the real stores. Minutes are summed from the usage
 * ledger, one entry for each job accepted, and a delete takes the jobs but not
 * the ledger: a project that produced output cannot be deleted to get the
 * minutes back. They run when TYPELAPSE_TEST_DATABASE_URL names a database:
 *
 *   TYPELAPSE_TEST_DATABASE_URL=postgres://postgres:typelapse@127.0.0.1:54402/typelapse
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;

const MINUTE = 60_000;
const PERIOD_START = new Date(Date.UTC(2026, 0, 1));

describe.skipIf(!DATABASE_URL)("the month's usage on PostgreSQL", () => {
	const db = createDatabase(DATABASE_URL ?? "postgres://unused");
	const projects = createProjectDocumentRepository(db);
	const jobs = createRenderJobRepository(db);
	const queue = createRenderJobQueue(db);
	const usage = createAccountUsageRepository(db);
	const made: string[] = [];
	const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
	const query = (text: string, values: unknown[] = []) => db.$client.query(text, values);

	beforeAll(async () => {
		await migrate(db, { migrationsFolder: "server/db/migrations" });
	});

	afterAll(async () => {
		for (const id of made) {
			await query("DELETE FROM object_deletion_outbox WHERE object_key LIKE $1", [
				`accounts/${id}/%`,
			]);
			await query('DELETE FROM "user" WHERE id = $1', [id]);
		}
		await db.$client.end();
	});

	async function account(label: string): Promise<string> {
		const id = `usage-${label}-${randomBytes(4).toString("hex")}`;
		await db.insert(user).values({ id, name: label, email: `${id}@typelapse.test` });
		made.push(id);
		return id;
	}

	async function project(ownerId: string): Promise<string> {
		const draft = migrateV1ToV2({
			title: "Usage",
			code: "const spent = true;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [{ code: "const spent = true;", duration: 1000 }],
		});
		const id = `project_${randomBytes(6).toString("hex")}`;
		const result = await projects.create({
			ownerId,
			document: { ...draft, project: { ...draft.project, id } },
			maxProjects: 100,
		});
		if (result.outcome !== "created") throw new Error("the project was not created");
		return id;
	}

	/** Submits a render of `minutes` against a quota; `variant` makes it a different request. */
	async function submit(
		ownerId: string,
		projectId: string,
		minutes: number,
		options: { variant?: string; maxMinutes?: number; maxActive?: number } = {},
	) {
		const stored = await projects.findOwnedById(ownerId, projectId);
		if (!stored) throw new Error("the project is not there");
		const id = `job_${randomBytes(6).toString("hex")}`;
		const result = await jobs.enqueueOrGet({
			id,
			ownerId,
			projectId,
			revision: stored.revision,
			projectDocument: stored.document,
			renderOptions: { format: "mp4", width: 1920, height: 1080, fps: 30, includeAudio: true },
			renderOptionsHash: sha256(options.variant ?? id),
			compilerVersion: "contract",
			durationMs: minutes * MINUTE,
			quota: {
				maxActiveRenders: options.maxActive ?? 10,
				maxRenderMsInPeriod: (options.maxMinutes ?? 60) * MINUTE,
				periodStart: PERIOD_START,
			},
		});
		return { id, result };
	}

	/**
	 * A worker holds the job (what `claim` writes, set directly: the queue is shared by
	 * every account, so claiming here would take other tests' jobs) and then finishes it
	 * or fails it, for good or for a retry.
	 */
	async function lease(jobId: string, attempt = 1) {
		await query(
			`UPDATE render_jobs SET status = 'running', attempts = $2, lease_owner = 'worker-a',
				lease_expires_at = now() + interval '10 minutes', started_at = now()
			WHERE id = $1`,
			[jobId, attempt],
		);
	}

	async function run(jobId: string, how: "succeed" | "fail" | "retry", attempt = 1) {
		const now = new Date();
		await lease(jobId, attempt);
		const held = { jobId, workerId: "worker-a", attempt, now };
		if (how === "succeed") {
			const key = `accounts/contract/renders/${jobId}/a.mp4`;
			return queue.succeed({
				...held,
				output: { objectKey: key, mimeType: "video/mp4", byteSize: 4096 },
			});
		}
		return queue.fail({
			...held,
			error: { code: "render-failed", message: "The render stopped." },
			retryAt: how === "retry" ? new Date(now.getTime() + MINUTE) : null,
		});
	}

	const minutesUsed = async (ownerId: string) =>
		(await usage.usageFor(ownerId, PERIOD_START)).hostedRenderMsThisMonth / MINUTE;

	async function rendered(ownerId: string, projectId: string, minutes: number) {
		const { id, result } = await submit(ownerId, projectId, minutes);
		expect(result.outcome).toBe("enqueued");
		expect(await run(id, "succeed")).toBe(true);
		return id;
	}

	it("keeps the month's minutes when the project that produced them is deleted", async () => {
		const owner = await account("delete");
		const doomed = await project(owner);
		await rendered(owner, doomed, 40);
		expect(await minutesUsed(owner)).toBe(40);

		expect(await projects.deleteOwnedById(owner, doomed)).toBe("deleted");

		expect(await minutesUsed(owner)).toBe(40);
	});

	it("refuses the next render over the allowance after the delete, naming the ceiling", async () => {
		const owner = await account("refuse");
		const first = await project(owner);
		await rendered(owner, first, 40);
		await projects.deleteOwnedById(owner, first);
		const second = await project(owner);

		const { result } = await submit(owner, second, 30);

		expect(result).toEqual({
			outcome: "quota-exceeded",
			ceiling: "hostedRenderTime",
			used: 40 * MINUTE,
		});
		expect((await submit(owner, second, 20)).result.outcome).toBe("enqueued");
	});

	it("shows the allowance sentence the same before and after a delete", async () => {
		const owner = await account("sentence");
		const doomed = await project(owner);
		await project(owner);
		await rendered(owner, doomed, 30);
		const sentence = async () =>
			allowanceSentence(Plan.pro(), await usage.usageFor(owner, PERIOD_START));
		const before = await sentence();

		await projects.deleteOwnedById(owner, doomed);
		const after = await sentence();

		expect(before).toContain("30 of 60 hosted render minutes this month");
		// The project count is the one number that is meant to move.
		expect(after.replace("1 of 100 cloud projects", "2 of 100 cloud projects")).toBe(before);
	});

	it("returns the minutes of a render that ends in failure, and of nothing else", async () => {
		const owner = await account("failure");
		const id = await project(owner);
		const { id: failing } = await submit(owner, id, 10);
		expect(await minutesUsed(owner)).toBe(10);

		// A retry is the same job still in line: its minutes stay.
		expect(await run(failing, "retry")).toBe(true);
		expect(await minutesUsed(owner)).toBe(10);
		expect(await run(failing, "fail", 2)).toBe(true);

		expect(await minutesUsed(owner)).toBe(0);
	});

	it("returns the minutes of a job whose lease expired for the last time", async () => {
		const owner = await account("lease");
		const id = await project(owner);
		const { id: lost } = await submit(owner, id, 10);
		await query(
			`UPDATE render_jobs SET status = 'running', attempts = 3, lease_owner = 'worker-gone',
				lease_expires_at = '2000-01-01', started_at = '2000-01-01'
			WHERE id = $1`,
			[lost],
		);

		// A moment in 2001: no other test's job is due yet, so the claim takes none of them.
		await queue.claim({
			workerId: "worker-b",
			now: new Date("2001-01-01T00:00:00Z"),
			leaseExpiresAt: new Date("2001-01-01T00:10:00Z"),
			maxAttempts: 3,
		});

		expect(await minutesUsed(owner)).toBe(0);
	});

	it("counts only the month the job was accepted in", async () => {
		const owner = await account("month");
		const id = await project(owner);
		const { id: old } = await submit(owner, id, 25);
		await query(`UPDATE render_usage SET accepted_at = $2 WHERE job_id = $1`, [
			old,
			new Date(Date.UTC(2025, 11, 31, 23, 0)),
		]);

		expect(await minutesUsed(owner)).toBe(0);
	});

	it("keeps counting the renders in flight, because a project with one cannot be deleted", async () => {
		const owner = await account("flight");
		const busy = await project(owner);
		const { id: queued } = await submit(owner, busy, 10);

		expect(await projects.deleteOwnedById(owner, busy)).toBe("render-active");
		expect(await projects.findOwnedById(owner, busy)).not.toBeNull();
		expect((await usage.usageFor(owner, PERIOD_START)).activeRenders).toBe(1);
		expect((await submit(owner, busy, 5, { maxActive: 1 })).result).toMatchObject({
			outcome: "quota-exceeded",
			ceiling: "concurrentRenders",
		});

		// Once the render ends the slot is free and the project can go.
		expect(await run(queued, "succeed")).toBe(true);
		expect(await projects.deleteOwnedById(owner, busy)).toBe("deleted");
		expect((await usage.usageFor(owner, PERIOD_START)).activeRenders).toBe(0);
		expect(await minutesUsed(owner)).toBe(10);
	});

	it("refuses to delete under a job a worker is rendering, and lets the worker finish", async () => {
		const owner = await account("running");
		const busy = await project(owner);
		const { id } = await submit(owner, busy, 10);
		const now = new Date();
		await lease(id);

		expect(await projects.deleteOwnedById(owner, busy)).toBe("render-active");

		const key = `accounts/${owner}/projects/${busy}/renders/${id}/a.mp4`;
		expect(
			await queue.succeed({
				jobId: id,
				workerId: "worker-a",
				attempt: 1,
				now,
				output: { objectKey: key, mimeType: "video/mp4", byteSize: 4096 },
			}),
		).toBe(true);
		expect(await projects.deleteOwnedById(owner, busy)).toBe("deleted");
		expect(await minutesUsed(owner)).toBe(10);
	});

	it("deletes after a job's completion that the delete was waiting for, with its minutes kept", async () => {
		const owner = await account("racing");
		const doomed = await project(owner);
		const { id } = await submit(owner, doomed, 15);
		await lease(id);
		const key = `accounts/${owner}/projects/${doomed}/renders/${id}/a.mp4`;
		const worker = await db.$client.connect();
		let deleting: ReturnType<typeof projects.deleteOwnedById>;
		try {
			// The worker has stored its result and is writing it down: it holds the job's row.
			await worker.query("BEGIN");
			await worker.query(
				`UPDATE render_jobs SET status = 'succeeded', lease_owner = NULL,
					lease_expires_at = NULL, completed_at = now(), output_object_key = $2,
					output_mime_type = 'video/mp4', output_byte_size = 4096
				WHERE id = $1`,
				[id, key],
			);
			deleting = projects.deleteOwnedById(owner, doomed);
			await expect
				.poll(async () => {
					const waiting = await query(
						`SELECT count(*)::int AS n FROM pg_stat_activity
						WHERE datname = current_database() AND wait_event_type = 'Lock'`,
					);
					return Number(waiting.rows[0]?.n);
				})
				.toBeGreaterThan(0);
			await worker.query("COMMIT");
		} finally {
			worker.release();
		}

		// The delete read the job after the worker's commit, so it saw a finished render.
		expect(await deleting).toBe("deleted");
		expect(await minutesUsed(owner)).toBe(15);
	});

	it("gives an account's usage to that account alone", async () => {
		const spender = await account("spender");
		const other = await account("other");
		await rendered(spender, await project(spender), 20);

		expect(await minutesUsed(other)).toBe(0);
	});

	it("counts the renders a database from before the ledger already held", async () => {
		const owner = await account("backfill");
		const id = await project(owner);
		// Rows as the previous release wrote them: jobs, and no ledger entry.
		const { id: counted } = await submit(owner, id, 12);
		const { id: failed } = await submit(owner, id, 7);
		await query(
			`UPDATE render_jobs SET status = 'failed', completed_at = now(), error_code = 'x'
			WHERE id = $1`,
			[failed],
		);
		await query("DELETE FROM render_usage WHERE job_id = ANY($1)", [[counted, failed]]);
		expect(await minutesUsed(owner)).toBe(0);

		const { readFileSync } = await import("node:fs");
		const migration = readFileSync("server/db/migrations/0008_render_usage.sql", "utf8");
		for (const statement of migration.split("--> statement-breakpoint")) {
			if (statement.includes("INSERT INTO")) await query(statement);
		}

		expect(await minutesUsed(owner)).toBe(12);
	});

	it("runs its migration again on a database that already has the ledger, and changes nothing", async () => {
		const owner = await account("rerun");
		await rendered(owner, await project(owner), 9);
		const { readFileSync } = await import("node:fs");
		const migration = readFileSync("server/db/migrations/0008_render_usage.sql", "utf8");

		for (const statement of migration.split("--> statement-breakpoint")) {
			await query(statement);
		}

		expect(await minutesUsed(owner)).toBe(9);
		const entries = await query("SELECT count(*)::int AS n FROM render_usage WHERE owner_id = $1", [
			owner,
		]);
		expect(entries.rows[0]?.n).toBe(1);
	});
});
