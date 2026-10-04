import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { CreatorDatabase } from "../../server/db/database";
import {
	createRenderJobQueue,
	createRenderPageRepository,
} from "../../server/db/render-job.repository";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";

const DOCUMENT = migrateV1ToV2({
	title: "Public page",
	code: "const shared = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const shared = true;", duration: 1000 }],
});

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

function queryParams(statement: SQL): unknown[] {
	return new PgDialect().sqlToQuery(statement).params;
}

describe("public render page persistence", () => {
	it("reads only a succeeded render whose public flag is on, by id alone", async () => {
		const database = capturingDatabase([
			{
				jobId: "job_1",
				ownerId: "owner-1",
				title: "Public page",
				document: DOCUMENT,
				renderOptions: { format: "mp4", width: 1280, height: 720, fps: 30, includeAudio: true },
				durationMs: 1500,
				completedAt: "2026-10-04T10:00:00.000Z",
				objectKey: "accounts/owner-1/renders/job_1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: "42000",
				posterObjectKey: "accounts/owner-1/renders/job_1/attempt-1.poster.jpg",
			},
		]);

		await expect(createRenderPageRepository(database.db).findPublished("job_1")).resolves.toEqual({
			jobId: "job_1",
			ownerId: "owner-1",
			title: "Public page",
			document: DOCUMENT,
			renderOptions: { format: "mp4", width: 1280, height: 720, fps: 30, includeAudio: true },
			durationMs: 1500,
			completedAt: new Date("2026-10-04T10:00:00.000Z"),
			output: {
				objectKey: "accounts/owner-1/renders/job_1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: 42_000,
			},
			posterObjectKey: "accounts/owner-1/renders/job_1/attempt-1.poster.jpg",
		});
		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("job.status = 'succeeded'");
		expect(statement).toContain("job.is_public");
		expect(statement).not.toContain("owner_id =");
	});

	it("answers null for anything that is not a published render", async () => {
		const database = capturingDatabase([]);

		await expect(
			createRenderPageRepository(database.db).findPublished("job_1"),
		).resolves.toBeNull();
	});

	it("flips the flag only on the owner's own succeeded render", async () => {
		const database = capturingDatabase([{ id: "job_1" }], []);
		const pages = createRenderPageRepository(database.db);

		await expect(pages.setPublic("owner-1", "job_1", true)).resolves.toBe(true);
		await expect(pages.setPublic("owner-2", "job_1", false)).resolves.toBe(false);

		const statement = database.statements[0] as SQL;
		expect(queryText(statement)).toContain("SET is_public =");
		expect(queryText(statement)).toContain("owner_id =");
		expect(queryText(statement)).toContain("status = 'succeeded'");
		expect(queryParams(statement)).toEqual(expect.arrayContaining([true, "owner-1", "job_1"]));
	});

	it("reads the flag owner-scoped, null for someone else's render", async () => {
		const database = capturingDatabase([{ isPublic: true }], []);
		const pages = createRenderPageRepository(database.db);

		await expect(pages.isPublic("owner-1", "job_1")).resolves.toBe(true);
		await expect(pages.isPublic("owner-2", "job_1")).resolves.toBeNull();
		expect(queryText(database.statements[0] as SQL)).toContain("owner_id =");
	});
});

describe("poster frame persistence", () => {
	it("publishes the poster key with the output, under the same fence", async () => {
		const database = capturingDatabase([{ id: "job_1" }]);

		await createRenderJobQueue(database.db).succeed({
			jobId: "job_1",
			workerId: "worker-a",
			attempt: 1,
			now: new Date("2026-10-04T10:00:00.000Z"),
			output: {
				objectKey: "accounts/owner-1/renders/job_1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: 42,
				posterObjectKey: "accounts/owner-1/renders/job_1/attempt-1.poster.jpg",
			},
		});

		const statement = database.statements[0] as SQL;
		expect(queryText(statement)).toContain("output_poster_key =");
		expect(queryParams(statement)).toContain("accounts/owner-1/renders/job_1/attempt-1.poster.jpg");
	});

	it("clears the poster with the output on a new claim and on a failure", async () => {
		const claim = capturingDatabase([], []);
		await createRenderJobQueue(claim.db).claim({
			workerId: "worker-a",
			now: new Date("2026-10-04T10:00:00.000Z"),
			leaseExpiresAt: new Date("2026-10-04T10:00:30.000Z"),
			maxAttempts: 3,
		});
		const fail = capturingDatabase([]);
		await createRenderJobQueue(fail.db).fail({
			jobId: "job_1",
			workerId: "worker-a",
			attempt: 1,
			now: new Date("2026-10-04T10:00:00.000Z"),
			error: { code: "boom", message: "boom" },
			retryAt: null,
		});

		expect(queryText(claim.statements[0] as SQL)).toContain("output_poster_key = NULL");
		expect(queryText(claim.statements[1] as SQL)).toContain("output_poster_key = NULL");
		expect(queryText(fail.statements[0] as SQL)).toContain("output_poster_key = NULL");
	});
});

describe("public page migration", () => {
	const migration = readFileSync(
		resolve("server/db/migrations/0005_public_render_pages.sql"),
		"utf8",
	);

	it("adds a private-by-default flag and the poster key, and re-runs harmlessly", () => {
		expect(migration).toContain(
			'ALTER TABLE "render_jobs" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL',
		);
		expect(migration).toContain(
			'ALTER TABLE "render_jobs" ADD COLUMN IF NOT EXISTS "output_poster_key" text',
		);
		expect(migration).not.toMatch(/DROP/);
		expect(migration).not.toMatch(/ADD COLUMN "/);
	});
});
