import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
	parseProjectDocument,
	type ProjectDocumentV2,
} from "../../src/application/project/project-document";
import {
	parseHostedRenderOptions,
	type HostedRenderJob,
	type RenderAssetReadinessPort,
	type RenderJobRepositoryPort,
} from "../../src/application/render/hosted-render-job";
import type {
	HostedRenderOutputRecord,
	HostedRenderOutputRepositoryPort,
} from "../../src/application/render/hosted-render-download";
import type {
	RenderJobLease,
	RenderJobQueuePort,
} from "../../src/application/render/hosted-render-worker";
import { assets, projects, renderJobs } from "./creator-schema";
import type { CreatorDatabase } from "./database";
import type { RenderOptions } from "./persistence-values";

type RenderJobRow = typeof renderJobs.$inferSelect;

interface RawRenderLeaseRow extends Record<string, unknown> {
	readonly id: string;
	readonly ownerId: string;
	readonly projectId: string;
	readonly revision: number;
	readonly projectDocument: unknown;
	readonly renderOptions: unknown;
	readonly compilerVersion: string;
	readonly attempt: number;
	readonly workerId: string;
	readonly expiresAt: Date | string;
}

interface AppliedRow extends Record<string, unknown> {
	readonly id: string;
}

interface RawRenderOutputRow extends Record<string, unknown> {
	readonly status: string;
	readonly objectKey: string | null;
	readonly mimeType: string | null;
	readonly byteSize: number | string | null;
}

const RENDER_STATUSES = new Set([
	"queued",
	"running",
	"succeeded",
	"failed",
	"canceled",
]);

async function executeRows<T extends Record<string, unknown>>(
	db: CreatorDatabase,
	statement: SQL,
): Promise<readonly T[]> {
	const result = await db.execute<T>(statement);
	return result.rows as readonly T[];
}

function dateFromPersistence(value: Date | string, label: string): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(parsed.getTime())) {
		throw new Error(`Hosted persistence returned an invalid ${label}`);
	}
	return parsed;
}

function projectDocumentFromPersistence(value: unknown): ProjectDocumentV2 {
	const parsed = parseProjectDocument(value);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Hosted render lease returned a legacy project document");
	}
	return parsed.document;
}

function renderLeaseFromRow(row: RawRenderLeaseRow): RenderJobLease {
	if (!Number.isSafeInteger(row.revision) || row.revision <= 0) {
		throw new Error("Hosted persistence returned an invalid render revision");
	}
	if (!Number.isSafeInteger(row.attempt) || row.attempt <= 0) {
		throw new Error("Hosted persistence returned an invalid render attempt");
	}
	const projectDocument = projectDocumentFromPersistence(row.projectDocument);
	if (projectDocument.project.id !== row.projectId) {
		throw new Error("Hosted render lease project identity does not match its snapshot");
	}
	return {
		id: row.id,
		ownerId: row.ownerId,
		projectId: row.projectId,
		revision: row.revision,
		projectDocument,
		renderOptions: parseHostedRenderOptions(row.renderOptions),
		compilerVersion: row.compilerVersion,
		attempt: row.attempt,
		workerId: row.workerId,
		expiresAt: dateFromPersistence(row.expiresAt, "render lease expiry"),
	};
}

const RENDER_LEASE_SELECTION = sql.raw(`
	job.id AS "id",
	job.owner_id AS "ownerId",
	job.project_id AS "projectId",
	job.revision AS "revision",
	job.project_document AS "projectDocument",
	job.render_options AS "renderOptions",
	job.compiler_version AS "compilerVersion",
	job.attempts AS "attempt",
	job.lease_owner AS "workerId",
	job.lease_expires_at AS "expiresAt"
`);

function currentLeaseWhere(input: {
	readonly jobId: string;
	readonly workerId: string;
	readonly attempt: number;
	readonly now: Date;
}): SQL {
	return sql`job.id = ${input.jobId}
		AND job.status = 'running'
		AND job.lease_owner = ${input.workerId}
		AND job.attempts = ${input.attempt}
		AND job.lease_expires_at > ${input.now}`;
}

export function hostedRenderJobFromRow(row: RenderJobRow): HostedRenderJob {
	return {
		id: row.id,
		projectId: row.projectId,
		revision: row.revision,
		status: row.status,
		createdAt: row.createdAt,
		completedAt: row.completedAt,
		...(row.errorCode ? { errorCode: row.errorCode } : {}),
	};
}

export function createRenderJobRepository(db: CreatorDatabase): RenderJobRepositoryPort {
	return {
		async enqueueOrGet(input) {
			const [created] = await db
				.insert(renderJobs)
				.values({
					id: input.id,
					projectId: input.projectId,
					ownerId: input.ownerId,
					revision: input.revision,
					projectDocument: input.projectDocument,
					renderOptions: input.renderOptions as unknown as RenderOptions,
					renderOptionsHash: input.renderOptionsHash,
					compilerVersion: input.compilerVersion,
				})
				.onConflictDoNothing({
					target: [
						renderJobs.projectId,
						renderJobs.revision,
						renderJobs.compilerVersion,
						renderJobs.renderOptionsHash,
					],
				})
				.returning();
			if (created) {
				return hostedRenderJobFromRow(created);
			}
			const [existing] = await db
				.select()
				.from(renderJobs)
				.where(
					and(
						eq(renderJobs.ownerId, input.ownerId),
						eq(renderJobs.projectId, input.projectId),
						eq(renderJobs.revision, input.revision),
						eq(renderJobs.compilerVersion, input.compilerVersion),
						eq(renderJobs.renderOptionsHash, input.renderOptionsHash),
					),
				)
				.limit(1);
			if (!existing) {
				throw new Error("Idempotent render job could not be reloaded");
			}
			return hostedRenderJobFromRow(existing);
		},

		async findOwnedById(ownerId, id) {
			const [row] = await db
				.select()
				.from(renderJobs)
				.where(and(eq(renderJobs.id, id), eq(renderJobs.ownerId, ownerId)))
				.limit(1);
			return row ? hostedRenderJobFromRow(row) : null;
		},
	};
}

function renderOutputFromRow(row: RawRenderOutputRow): HostedRenderOutputRecord {
	if (!RENDER_STATUSES.has(row.status)) {
		throw new Error("Hosted persistence returned an invalid render status");
	}
	if (row.status !== "succeeded") {
		return { status: row.status as HostedRenderOutputRecord["status"], output: null };
	}
	if (!row.objectKey || !row.mimeType || row.byteSize === null) {
		throw new Error("Succeeded hosted render is missing durable output metadata");
	}
	const byteSize = typeof row.byteSize === "number" ? row.byteSize : Number(row.byteSize);
	if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
		throw new Error("Hosted persistence returned an invalid render output size");
	}
	return {
		status: "succeeded",
		output: {
			objectKey: row.objectKey,
			mimeType: row.mimeType,
			byteSize,
		},
	};
}

/** Private output metadata remains behind an owner-scoped download service. */
export function createRenderOutputRepository(
	db: CreatorDatabase,
): HostedRenderOutputRepositoryPort {
	return {
		async findOwnedOutput(ownerId, jobId) {
			const rows = await executeRows<RawRenderOutputRow>(
				db,
				sql`SELECT
					job.status AS "status",
					job.output_object_key AS "objectKey",
					job.output_mime_type AS "mimeType",
					job.output_byte_size AS "byteSize"
				FROM render_jobs AS job
				WHERE job.owner_id = ${ownerId}
					AND job.id = ${jobId}
				LIMIT 1`,
			);
			const row = rows[0];
			return row ? renderOutputFromRow(row) : null;
		},
	};
}

/**
 * Atomic worker queue. `attempts` is the fencing token: every claim, including
 * recovery of an expired lease, increments it before returning the snapshot.
 */
export function createRenderJobQueue(db: CreatorDatabase): RenderJobQueuePort {
	return {
		async claim(input) {
			await executeRows<AppliedRow>(
				db,
				sql`UPDATE render_jobs AS job
				SET status = 'failed',
					lease_owner = NULL,
					lease_expires_at = NULL,
					output_object_key = NULL,
					output_mime_type = NULL,
					output_byte_size = NULL,
					error_code = 'lease-expired',
					error_message = 'Render worker lease expired after maximum attempts',
					updated_at = ${input.now},
					completed_at = ${input.now}
				WHERE job.status = 'running'
					AND job.attempts >= ${input.maxAttempts}
					AND job.lease_expires_at <= ${input.now}
				RETURNING job.id AS "id"`,
			);
			const rows = await executeRows<RawRenderLeaseRow>(
				db,
				sql`WITH candidate AS (
					SELECT id
					FROM render_jobs
					WHERE (
						status = 'queued'
						AND available_at <= ${input.now}
						AND attempts < ${input.maxAttempts}
					) OR (
						status = 'running'
						AND lease_expires_at <= ${input.now}
						AND attempts < ${input.maxAttempts}
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
				UPDATE render_jobs AS job
				SET status = 'running',
					attempts = job.attempts + 1,
					available_at = ${input.leaseExpiresAt},
					lease_owner = ${input.workerId},
					lease_expires_at = ${input.leaseExpiresAt},
					output_object_key = NULL,
					output_mime_type = NULL,
					output_byte_size = NULL,
					error_code = NULL,
					error_message = NULL,
					updated_at = ${input.now},
					started_at = COALESCE(job.started_at, ${input.now}),
					completed_at = NULL
				FROM candidate
				WHERE job.id = candidate.id
				RETURNING ${RENDER_LEASE_SELECTION}`,
			);
			const row = rows[0];
			return row ? renderLeaseFromRow(row) : null;
		},

		async heartbeat(input) {
			const rows = await executeRows<AppliedRow>(
				db,
				sql`UPDATE render_jobs AS job
				SET lease_expires_at = GREATEST(job.lease_expires_at, ${input.leaseExpiresAt}),
					available_at = GREATEST(job.lease_expires_at, ${input.leaseExpiresAt}),
					updated_at = ${input.now}
				WHERE ${currentLeaseWhere(input)}
					AND ${input.leaseExpiresAt} > ${input.now}
				RETURNING job.id AS "id"`,
			);
			return rows.length === 1;
		},

		async succeed(input) {
			const rows = await executeRows<AppliedRow>(
				db,
				sql`UPDATE render_jobs AS job
				SET status = 'succeeded',
					lease_owner = NULL,
					lease_expires_at = NULL,
					output_object_key = ${input.output.objectKey},
					output_mime_type = ${input.output.mimeType},
					output_byte_size = ${input.output.byteSize},
					error_code = NULL,
					error_message = NULL,
					updated_at = ${input.now},
					completed_at = ${input.now}
				WHERE ${currentLeaseWhere(input)}
				RETURNING job.id AS "id"`,
			);
			return rows.length === 1;
		},

		async fail(input) {
			const failureTransition = input.retryAt
				? sql`status = 'queued',
					available_at = ${input.retryAt},
					completed_at = NULL,
					error_code = NULL,
					error_message = NULL`
				: sql`status = 'failed',
					completed_at = ${input.now},
					error_code = ${input.error.code},
					error_message = ${input.error.message}`;
			const rows = await executeRows<AppliedRow>(
				db,
				sql`UPDATE render_jobs AS job
				SET ${failureTransition},
					lease_owner = NULL,
					lease_expires_at = NULL,
					output_object_key = NULL,
					output_mime_type = NULL,
					output_byte_size = NULL,
					updated_at = ${input.now}
				WHERE ${currentLeaseWhere(input)}
				RETURNING job.id AS "id"`,
			);
			return rows.length === 1;
		},
	};
}

/** Only ready, checksum-verified assets belonging to the owned project pass. */
export function createRenderAssetReadiness(db: CreatorDatabase): RenderAssetReadinessPort {
	return {
		async missingReadyAssetIds(input) {
			if (input.assetIds.length === 0) {
				return [];
			}
			const rows = await db
				.select({ id: assets.id })
				.from(assets)
				.innerJoin(
					projects,
					and(eq(projects.id, assets.projectId), eq(projects.ownerId, input.ownerId)),
				)
				.where(
					and(
						eq(assets.projectId, input.projectId),
						inArray(assets.id, [...input.assetIds]),
						eq(assets.uploadStatus, "ready"),
						sql`${assets.verifiedChecksum} = ${assets.checksum}`,
					),
				);
			const ready = new Set(rows.map((row) => row.id));
			return input.assetIds.filter((id) => !ready.has(id));
		},
	};
}
