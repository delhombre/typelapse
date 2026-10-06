// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../server/db/database";
import { createProjectDocumentRepository } from "../../server/db/project-document.repository";
import {
	createRenderJobRepository,
	createRenderOutputRepository,
	createRenderPageRepository,
} from "../../server/db/render-job.repository";
import { user } from "../../server/db/schema";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";

/**
 * Deleting a cloud project on the real stores. What a person is told goes with
 * it (its media, its renders, their public pages) is only true if PostgreSQL
 * agrees: the cascade is in the schema, and the stored bytes are in a bucket the
 * schema cannot reach, so the delete must leave a durable note for each of them.
 * They run when TYPELAPSE_TEST_DATABASE_URL names a database, for example the
 * one `tests/e2e/hosted/services.sh up` starts:
 *
 *   TYPELAPSE_TEST_DATABASE_URL=postgres://postgres:typelapse@127.0.0.1:54381/typelapse
 *
 * Each test makes its own accounts and removes them, which takes their projects,
 * media and jobs with them.
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;

const QUOTA = {
	maxActiveRenders: 10,
	maxRenderMsInPeriod: 10 * 60 * 60_000,
	periodStart: new Date(Date.UTC(2026, 0, 1)),
} as const;

describe.skipIf(!DATABASE_URL)("deleting a cloud project on PostgreSQL", () => {
	const db = createDatabase(DATABASE_URL ?? "postgres://unused");
	const projects = createProjectDocumentRepository(db);
	const jobs = createRenderJobRepository(db);
	const pages = createRenderPageRepository(db);
	const outputs = createRenderOutputRepository(db);
	const made: string[] = [];
	const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
	const query = (text: string, values: unknown[] = []) => db.$client.query(text, values);

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
		const id = `delete-${label}-${randomBytes(4).toString("hex")}`;
		await db.insert(user).values({ id, name: label, email: `${id}@typelapse.test` });
		made.push(id);
		return id;
	}

	async function project(ownerId: string, title: string): Promise<string> {
		const draft = migrateV1ToV2({
			title,
			code: "const gone = false;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [{ code: "const gone = false;", duration: 1000 }],
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

	/** An uploaded file of the project: `ready` is a verified image, anything else a pending slot. */
	async function media(
		ownerId: string,
		projectId: string,
		state: "ready" | "pending" | "deleted",
	): Promise<string> {
		const id = `asset_${randomBytes(6).toString("hex")}`;
		const key = `accounts/${ownerId}/projects/${projectId}/assets/${id}`;
		const checksum = sha256(id);
		const ready = state === "ready";
		await query(
			`INSERT INTO assets (
				id, project_id, kind, file_name, mime_type, byte_size, object_key,
				reserve_idempotency_key, checksum, verified_checksum, width, height,
				upload_status, ready_at, deleted_at
			) VALUES (
				$1, $2, 'image', 'logo.png', 'image/png', 2048, $3, $1, $4,
				CASE WHEN $6::boolean THEN $4 END, 800, 600, $5::asset_upload_status,
				CASE WHEN $6::boolean THEN now() END, CASE WHEN $7::boolean THEN now() END
			)`,
			[id, projectId, key, checksum, state, ready, state === "deleted"],
		);
		return key;
	}

	/** A queued job on the project's first revision; `variant` makes it a different request. */
	async function queued(
		ownerId: string,
		projectId: string,
		variant: string,
	): Promise<{ id: string; keys: { video: string; poster: string } }> {
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
			renderOptionsHash: sha256(variant),
			compilerVersion: "contract",
			durationMs: 1000,
			quota: QUOTA,
		});
		if (result.outcome !== "enqueued") throw new Error("the job was not queued");
		const base = `accounts/${ownerId}/projects/${projectId}/renders/${id}`;
		return { id, keys: { video: `${base}/attempt-1.mp4`, poster: `${base}/attempt-1.poster.jpg` } };
	}

	/** What the worker writes when a render finishes, and what its owner's switch makes public. */
	async function finished(jobId: string, keys: { video: string; poster: string }, isPublic: boolean) {
		await query(
			`UPDATE render_jobs SET status = 'succeeded', attempts = 1, started_at = now(),
				completed_at = now(), output_object_key = $2, output_mime_type = 'video/mp4',
				output_byte_size = 4096, output_poster_key = $3, is_public = $4
			WHERE id = $1`,
			[jobId, keys.video, keys.poster, isPublic],
		);
	}

	/** A job a worker holds right now. */
	async function leased(jobId: string, workerId: string) {
		await query(
			`UPDATE render_jobs SET status = 'running', attempts = 1, lease_owner = $2,
				lease_expires_at = now() + interval '10 minutes', started_at = now()
			WHERE id = $1`,
			[jobId, workerId],
		);
	}

	/** A render that ended without output: the worker gave up on it. */
	async function gaveUp(jobId: string) {
		await query(
			`UPDATE render_jobs SET status = 'failed', attempts = 3, completed_at = now(),
				error_code = 'render-failed'
			WHERE id = $1`,
			[jobId],
		);
	}

	const count = async (table: "assets" | "render_jobs" | "projects", projectId: string) => {
		const column = table === "projects" ? "id" : "project_id";
		const result = await query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [
			projectId,
		]);
		return Number(result.rows[0]?.n);
	};

	const outboxKeys = async (ownerId: string): Promise<string[]> => {
		const result = await query(
			"SELECT object_key FROM object_deletion_outbox WHERE object_key LIKE $1",
			[`accounts/${ownerId}/%`],
		);
		return result.rows.map((row) => String(row.object_key)).sort();
	};

	it("takes its media, its renders and their public pages with it", async () => {
		const owner = await account("everything");
		const doomed = await project(owner, "Launch");
		await media(owner, doomed, "ready");
		await media(owner, doomed, "pending");
		const shared = await queued(owner, doomed, "shared");
		await finished(shared.id, shared.keys, true);
		const waiting = await queued(owner, doomed, "waiting");
		await gaveUp(waiting.id);
		expect((await pages.findPublished(shared.id))?.jobId).toBe(shared.id);

		const deleted = await projects.deleteOwnedById(owner, doomed);

		expect(deleted).toBe("deleted");
		expect(await projects.findOwnedById(owner, doomed)).toBeNull();
		expect(await count("projects", doomed)).toBe(0);
		expect(await count("assets", doomed)).toBe(0);
		expect(await count("render_jobs", doomed)).toBe(0);
		// The page, the owner's job lookup, the download and the status all answer "not here".
		expect(await pages.findPublished(shared.id)).toBeNull();
		expect(await jobs.findOwnedById(owner, shared.id)).toBeNull();
		expect(await jobs.findOwnedById(owner, waiting.id)).toBeNull();
		expect(await outputs.findOwnedOutput(owner, shared.id)).toBeNull();
		expect(await projects.listByOwner(owner)).toEqual([]);
	});

	it("leaves a note to delete each stored object, in the same step as the rows", async () => {
		const owner = await account("notes");
		const doomed = await project(owner, "Stored");
		const ready = await media(owner, doomed, "ready");
		const pending = await media(owner, doomed, "pending");
		// An upload already deleted by the media route has its own note, and no second one.
		const removed = await media(owner, doomed, "deleted");
		const finishedJob = await queued(owner, doomed, "finished");
		await finished(finishedJob.id, finishedJob.keys, false);
		// A render that has produced nothing has nothing stored.
		await gaveUp((await queued(owner, doomed, "waiting")).id);

		await projects.deleteOwnedById(owner, doomed);

		const expected = [ready, pending, finishedJob.keys.video, finishedJob.keys.poster].sort();
		expect(await outboxKeys(owner)).toEqual(expected);
		expect(await outboxKeys(owner)).not.toContain(removed);
		const waiting = await query(
			"SELECT status, attempts FROM object_deletion_outbox WHERE object_key = $1",
			[ready],
		);
		expect(waiting.rows).toEqual([{ status: "pending", attempts: 0 }]);
	});

	it("notes the result a worker commits while the delete is waiting for its job", async () => {
		const owner = await account("racing");
		const doomed = await project(owner, "Racing");
		const job = await queued(owner, doomed, "racing");
		await leased(job.id, "worker-a");
		const worker = await db.$client.connect();
		let deleting: ReturnType<typeof projects.deleteOwnedById>;
		try {
			// The worker has stored its result and is writing it down: it holds the job's row.
			await worker.query("BEGIN");
			await worker.query(
				`UPDATE render_jobs SET status = 'succeeded', lease_owner = NULL,
					lease_expires_at = NULL, completed_at = now(), output_object_key = $2,
					output_mime_type = 'video/mp4', output_byte_size = 4096, output_poster_key = $3
				WHERE id = $1`,
				[job.id, job.keys.video, job.keys.poster],
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

		expect(await deleting).toBe("deleted");
		expect(await outboxKeys(owner)).toEqual([job.keys.poster, job.keys.video].sort());
	});

	it("keeps an object's existing note instead of failing on it", async () => {
		const owner = await account("noted");
		const doomed = await project(owner, "Noted");
		const key = await media(owner, doomed, "ready");
		await query(
			"INSERT INTO object_deletion_outbox (id, object_key) VALUES ($1, $2)",
			[`earlier-${randomBytes(3).toString("hex")}`, key],
		);

		expect(await projects.deleteOwnedById(owner, doomed)).toBe("deleted");

		expect(await outboxKeys(owner)).toEqual([key]);
	});

	it("does not touch another account's project, even when it is asked for by id", async () => {
		const owner = await account("owner");
		const stranger = await account("stranger");
		const kept = await project(owner, "Mine");
		await media(owner, kept, "ready");
		const job = await queued(owner, kept, "kept");
		await finished(job.id, job.keys, true);

		const deleted = await projects.deleteOwnedById(stranger, kept);

		expect(deleted).toBe("not-found");
		expect(await count("projects", kept)).toBe(1);
		expect(await count("assets", kept)).toBe(1);
		expect(await count("render_jobs", kept)).toBe(1);
		expect((await pages.findPublished(job.id))?.jobId).toBe(job.id);
		expect(await outboxKeys(owner)).toEqual([]);
	});

	it("takes only the project it was asked for, and says so when it is already gone", async () => {
		const owner = await account("two");
		const doomed = await project(owner, "Doomed");
		const spared = await project(owner, "Spared");
		await media(owner, spared, "ready");
		const job = await queued(owner, spared, "spared");

		expect(await projects.deleteOwnedById(owner, doomed)).toBe("deleted");
		expect(await projects.deleteOwnedById(owner, doomed)).toBe("not-found");

		expect((await projects.listByOwner(owner)).map((entry) => entry.id)).toEqual([spared]);
		expect(await count("assets", spared)).toBe(1);
		expect((await jobs.findOwnedById(owner, job.id))?.id).toBe(job.id);
		expect(await outboxKeys(owner)).toEqual([]);
	});
});
