import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { CreatorDatabase } from "../../server/db/database";
import {
	createRenderJobQueue,
	createRenderOutputRepository,
	hostedRenderJobFromRow,
} from "../../server/db/render-job.repository";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const DOCUMENT = migrateV1ToV2({
	title: "Queue",
	code: "const queue = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const queue = true;", duration: 1000 }],
});

function rawLeaseRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "job-1",
		ownerId: "owner-1",
		projectId: DOCUMENT.project.id,
		revision: 4,
		projectDocument: DOCUMENT,
		renderOptions: {
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: true,
		},
		compilerVersion: "compiler-v2",
		attempt: 2,
		workerId: "worker-b",
		expiresAt: "2026-08-30T20:00:30.000Z",
		...overrides,
	};
}

function capturingDatabase(...rowSets: ReadonlyArray<readonly unknown[]>) {
	const statements: SQL[] = [];
	const queue = [...rowSets];
	const db = {
		execute: async (statement: SQL) => {
			statements.push(statement);
			return { rows: queue.shift() ?? [] };
		},
	} as unknown as CreatorDatabase;
	return { db, statements };
}

function queryText(statement: SQL): string {
	return new PgDialect().sqlToQuery(statement).sql.replaceAll(/\s+/g, " ").trim();
}

describe("render job persistence mapping", () => {
	it("exposes durable state without leaking object storage keys", () => {
		const job = hostedRenderJobFromRow({
			id: "job-1",
			projectId: "project-1",
			ownerId: "user-1",
			revision: 3,
			projectDocument: { schemaVersion: 2, project: {} },
			renderOptions: { format: "mp4" },
			renderOptionsHash: "a".repeat(64),
			compilerVersion: "compiler-v2",
			durationMs: 1000,
			status: "succeeded",
			attempts: 1,
			availableAt: NOW,
			leaseOwner: null,
			leaseExpiresAt: null,
			outputObjectKey: "private/user-1/job-1.mp4",
			outputMimeType: "video/mp4",
			outputByteSize: 1024,
			outputPosterKey: null,
			isPublic: false,
			errorCode: null,
			errorMessage: null,
			createdAt: NOW,
			updatedAt: NOW,
			startedAt: NOW,
			completedAt: NOW,
		});

		expect(job).toEqual({
			id: "job-1",
			projectId: "project-1",
			revision: 3,
			status: "succeeded",
			createdAt: NOW,
			completedAt: NOW,
		});
		expect(job).not.toHaveProperty("outputObjectKey");
	});

	it("loads a private output only through an owner-scoped job lookup", async () => {
		const database = capturingDatabase([
			{
				status: "succeeded",
				objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: "42000",
			},
		]);

		await expect(
			createRenderOutputRepository(database.db).findOwnedOutput("owner-1", "job-1"),
		).resolves.toEqual({
			status: "succeeded",
			output: {
				objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: 42_000,
			},
		});

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("owner_id =");
		expect(statement).toContain("id =");
	});

	it("keeps unfinished output metadata private and rejects malformed success rows", async () => {
		const pending = capturingDatabase([
			{ status: "running", objectKey: null, mimeType: null, byteSize: null },
		]);
		const invalid = capturingDatabase([
			{ status: "succeeded", objectKey: null, mimeType: null, byteSize: null },
		]);

		await expect(
			createRenderOutputRepository(pending.db).findOwnedOutput("owner-1", "job-1"),
		).resolves.toEqual({ status: "running", output: null });
		await expect(
			createRenderOutputRepository(invalid.db).findOwnedOutput("owner-1", "job-1"),
		).rejects.toThrow("Succeeded hosted render is missing durable output metadata");
	});
});

describe("render job queue persistence", () => {
	it("atomically claims queued work or an expired lease with an incremented fence", async () => {
		const database = capturingDatabase([], [rawLeaseRow()]);
		const queue = createRenderJobQueue(database.db);

		await expect(
			queue.claim({
				workerId: "worker-b",
				now: NOW,
				leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
				maxAttempts: 3,
			}),
		).resolves.toEqual({
			...rawLeaseRow(),
			expiresAt: new Date("2026-08-30T20:00:30.000Z"),
		});

		const recovery = queryText(database.statements[0] as SQL);
		expect(recovery).toContain("status = 'failed'");
		expect(recovery).toContain("attempts >=");
		expect(recovery).toContain("lease_expires_at <=");
		expect(recovery).toContain("error_code = 'lease-expired'");

		const statement = queryText(database.statements[1] as SQL);
		expect(statement).toContain("FOR UPDATE SKIP LOCKED");
		expect(statement).toContain("status = 'queued'");
		expect(statement).toContain("status = 'running'");
		expect(statement).toContain("lease_expires_at <=");
		expect(statement).toContain("attempts <");
		expect(statement).toContain("attempts = job.attempts + 1");
	});

	it("returns no work when another atomic claimant won", async () => {
		const database = capturingDatabase([], []);

		await expect(
			createRenderJobQueue(database.db).claim({
				workerId: "worker-b",
				now: NOW,
				leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
				maxAttempts: 3,
			}),
		).resolves.toBeNull();
	});

	it("heartbeats only the current, still-live fenced attempt", async () => {
		const database = capturingDatabase([{ id: "job-1" }], []);
		const queue = createRenderJobQueue(database.db);
		const command = {
			jobId: "job-1",
			workerId: "worker-b",
			attempt: 2,
			now: NOW,
			leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
		};

		await expect(queue.heartbeat(command)).resolves.toBe(true);
		await expect(queue.heartbeat(command)).resolves.toBe(false);

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("lease_owner =");
		expect(statement).toContain("attempts =");
		expect(statement).toContain("lease_expires_at >");
	});

	it("publishes success only from the current live lease", async () => {
		const database = capturingDatabase([{ id: "job-1" }]);
		const queue = createRenderJobQueue(database.db);

		await expect(
			queue.succeed({
				jobId: "job-1",
				workerId: "worker-b",
				attempt: 2,
				now: NOW,
				output: {
					objectKey: "accounts/owner-1/renders/job-1.mp4",
					mimeType: "video/mp4",
					byteSize: 42_000,
				},
			}),
		).resolves.toBe(true);

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("status = 'succeeded'");
		expect(statement).toContain("lease_expires_at >");
		expect(statement).toContain("attempts =");
	});

	it("requeues with backoff or records a terminal failure atomically", async () => {
		const database = capturingDatabase([{ id: "job-1" }], [{ id: "job-1" }]);
		const queue = createRenderJobQueue(database.db);
		const base = {
			jobId: "job-1",
			workerId: "worker-b",
			attempt: 2,
			now: NOW,
			error: { code: "render-crashed", message: "renderer exited" },
		};

		await expect(
			queue.fail({ ...base, retryAt: new Date("2026-08-30T20:00:04.000Z") }),
		).resolves.toBe(true);
		await expect(queue.fail({ ...base, retryAt: null })).resolves.toBe(true);

		const retry = queryText(database.statements[0] as SQL);
		expect(retry).toContain("status = 'queued'");
		expect(retry).toContain("available_at =");
		expect(retry).toContain("error_code = NULL");

		const terminal = queryText(database.statements[1] as SQL);
		expect(terminal).toContain("status = 'failed'");
		expect(terminal).toContain("completed_at =");
		expect(terminal).toContain("error_code =");
		expect(terminal).toContain("lease_expires_at >");
	});
});
