import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { objectDeletionOutbox } from "../../server/db/creator-schema";
import type { CreatorDatabase } from "../../server/db/database";
import { createObjectDeletionQueue } from "../../server/db/object-deletion-outbox.repository";

const NOW = new Date("2026-08-30T20:00:00.000Z");

function capturingDatabase(...rowSets: ReadonlyArray<readonly unknown[]>) {
	const statements: SQL[] = [];
	const rows = [...rowSets];
	const db = {
		execute: async (statement: SQL) => {
			statements.push(statement);
			return { rows: rows.shift() ?? [] };
		},
	} as unknown as CreatorDatabase;
	return { db, statements };
}

function queryText(statement: SQL): string {
	return new PgDialect().sqlToQuery(statement).sql.replaceAll(/\s+/g, " ").trim();
}

function rawLeaseRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "asset-1",
		objectKey: "accounts/owner-1/projects/project-1/assets/asset-1",
		attempt: 2,
		workerId: "worker-b",
		expiresAt: "2026-08-30T20:00:30.000Z",
		...overrides,
	};
}

describe("object deletion outbox persistence", () => {
	it("stores a durable leaseable deletion without an asset foreign key", () => {
		const config = getTableConfig(objectDeletionOutbox);

		expect(config.foreignKeys).toHaveLength(0);
		expect(config.indexes.map((index) => index.config.name)).toContain(
			"object_deletion_outbox_claim_idx",
		);
		expect(config.checks.map((constraint) => constraint.name)).toEqual(
			expect.arrayContaining([
				"object_deletion_outbox_status_check",
				"object_deletion_outbox_lease_state_check",
			]),
		);
	});

	it("atomically claims pending work or an expired lease with an incremented fence", async () => {
		const database = capturingDatabase([rawLeaseRow()]);
		const queue = createObjectDeletionQueue(database.db);

		await expect(
			queue.claim({
				workerId: "worker-b",
				now: NOW,
				leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
			}),
		).resolves.toEqual({
			...rawLeaseRow(),
			expiresAt: new Date("2026-08-30T20:00:30.000Z"),
		});

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("FOR UPDATE SKIP LOCKED");
		expect(statement).toContain("status = 'pending'");
		expect(statement).toContain("status = 'running'");
		expect(statement).toContain("lease_expires_at <=");
		expect(statement).toContain("attempts = entry.attempts + 1");
	});

	it("removes success only from the current live fenced lease", async () => {
		const database = capturingDatabase([{ id: "asset-1" }]);
		const queue = createObjectDeletionQueue(database.db);

		await expect(
			queue.succeed({
				entryId: "asset-1",
				workerId: "worker-b",
				attempt: 2,
				now: NOW,
			}),
		).resolves.toBe(true);

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("DELETE FROM object_deletion_outbox AS entry");
		expect(statement).toContain("lease_owner =");
		expect(statement).toContain("attempts =");
		expect(statement).toContain("lease_expires_at >");
	});

	it("requeues failures durably with backoff and clears the lease", async () => {
		const database = capturingDatabase([{ id: "asset-1" }]);
		const queue = createObjectDeletionQueue(database.db);

		await expect(
			queue.fail({
				entryId: "asset-1",
				workerId: "worker-b",
				attempt: 2,
				now: NOW,
				errorMessage: "provider unavailable",
				retryAt: new Date("2026-08-30T20:00:04.000Z"),
			}),
		).resolves.toBe(true);

		const statement = queryText(database.statements[0] as SQL);
		expect(statement).toContain("status = 'pending'");
		expect(statement).toContain("available_at =");
		expect(statement).toContain("lease_owner = NULL");
		expect(statement).toContain("last_error =");
		expect(statement).toContain("lease_expires_at >");
	});

	it("ships the outbox insert in the same asset-deletion function", () => {
		const migration = readFileSync(
			resolve("server/db/migrations/0003_lucky_the_anarchist.sql"),
			"utf8",
		);
		const insertAt = migration.indexOf("INSERT INTO object_deletion_outbox");
		const deleteMarkAt = migration.indexOf("SET upload_status = 'deleted'");

		expect(insertAt).toBeGreaterThan(-1);
		expect(deleteMarkAt).toBeGreaterThan(insertAt);
	});
});
