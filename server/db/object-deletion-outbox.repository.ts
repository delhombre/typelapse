import { sql, type SQL } from "drizzle-orm";
import type {
	ObjectDeletionLease,
	ObjectDeletionQueuePort,
} from "../../src/application/assets/object-deletion-worker";
import type { CreatorDatabase } from "./database";

interface RawObjectDeletionLeaseRow extends Record<string, unknown> {
	readonly id: string;
	readonly objectKey: string;
	readonly attempt: number;
	readonly workerId: string;
	readonly expiresAt: Date | string;
}

interface AppliedRow extends Record<string, unknown> {
	readonly id: string;
}

async function executeRows<T extends Record<string, unknown>>(
	db: CreatorDatabase,
	statement: SQL,
): Promise<readonly T[]> {
	const result = await db.execute<T>(statement);
	return result.rows as readonly T[];
}

function dateFromPersistence(value: Date | string): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(parsed.getTime())) {
		throw new Error("Object deletion persistence returned an invalid lease expiry");
	}
	return parsed;
}

function leaseFromRow(row: RawObjectDeletionLeaseRow): ObjectDeletionLease {
	if (!Number.isSafeInteger(row.attempt) || row.attempt <= 0) {
		throw new Error("Object deletion persistence returned an invalid attempt fence");
	}
	if (!row.id || !row.objectKey || !row.workerId) {
		throw new Error("Object deletion persistence returned an incomplete lease");
	}
	return {
		id: row.id,
		objectKey: row.objectKey,
		attempt: row.attempt,
		workerId: row.workerId,
		expiresAt: dateFromPersistence(row.expiresAt),
	};
}

function currentLeaseWhere(input: {
	readonly entryId: string;
	readonly workerId: string;
	readonly attempt: number;
	readonly now: Date;
}): SQL {
	return sql`entry.id = ${input.entryId}
		AND entry.status = 'running'
		AND entry.lease_owner = ${input.workerId}
		AND entry.attempts = ${input.attempt}
		AND entry.lease_expires_at > ${input.now}`;
}

/** Atomic SKIP LOCKED queue for durable, idempotent private-object cleanup. */
export function createObjectDeletionQueue(db: CreatorDatabase): ObjectDeletionQueuePort {
	return {
		async claim(input) {
			const rows = await executeRows<RawObjectDeletionLeaseRow>(
				db,
				sql`WITH candidate AS (
					SELECT id
					FROM object_deletion_outbox
					WHERE (
						status = 'pending'
						AND available_at <= ${input.now}
					) OR (
						status = 'running'
						AND lease_expires_at <= ${input.now}
					)
					ORDER BY
						CASE
							WHEN status = 'running' THEN lease_expires_at
							ELSE available_at
						END ASC,
						created_at ASC,
						id ASC
					FOR UPDATE SKIP LOCKED
					LIMIT 1
				)
				UPDATE object_deletion_outbox AS entry
				SET status = 'running',
					attempts = entry.attempts + 1,
					lease_owner = ${input.workerId},
					lease_expires_at = ${input.leaseExpiresAt},
					updated_at = ${input.now}
				FROM candidate
				WHERE entry.id = candidate.id
					AND ${input.leaseExpiresAt} > ${input.now}
				RETURNING
					entry.id AS "id",
					entry.object_key AS "objectKey",
					entry.attempts AS "attempt",
					entry.lease_owner AS "workerId",
					entry.lease_expires_at AS "expiresAt"`,
			);
			const row = rows[0];
			return row ? leaseFromRow(row) : null;
		},

		async succeed(input) {
			const rows = await executeRows<AppliedRow>(
				db,
				sql`DELETE FROM object_deletion_outbox AS entry
				WHERE ${currentLeaseWhere(input)}
				RETURNING entry.id AS "id"`,
			);
			return rows.length === 1;
		},

		async fail(input) {
			const rows = await executeRows<AppliedRow>(
				db,
				sql`UPDATE object_deletion_outbox AS entry
				SET status = 'pending',
					available_at = ${input.retryAt},
					lease_owner = NULL,
					lease_expires_at = NULL,
					last_error = ${input.errorMessage},
					updated_at = ${input.now}
				WHERE ${currentLeaseWhere(input)}
					AND ${input.retryAt} > ${input.now}
				RETURNING entry.id AS "id"`,
			);
			return rows.length === 1;
		},
	};
}
