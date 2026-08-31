import { sql, type SQL } from "drizzle-orm";
import type { HostedProjectAssetResolverPort } from "../../src/application/assets/hosted-project-asset-resolver.port";
import { Asset } from "../../src/domain/entities/asset";
import type {
	AssetFailureCode,
	AssetRecord,
	AssetRepositoryPort,
	AssetUploadStatus,
	DeleteOwnedAssetResult,
	FinalizeAssetResult,
	FinalizeReadyAssetCommand,
	MarkAssetFailedCommand,
	MarkAssetFailedResult,
	ReservePendingAssetCommand,
	ReservePendingAssetResult,
} from "../../src/application/assets/asset-repository.port";
import { assets } from "./creator-schema";
import type { CreatorDatabase } from "./database";

type AssetRow = typeof assets.$inferSelect;

interface RawAssetRow
	extends Omit<AssetRow, "byteSize" | "createdAt" | "updatedAt" | "readyAt" | "deletedAt">,
		Record<string, unknown> {
	readonly ownerId: string;
	readonly byteSize: number | string;
	readonly createdAt: Date | string;
	readonly updatedAt: Date | string;
	readonly readyAt: Date | string | null;
	readonly deletedAt: Date | string | null;
}

interface ReserveFunctionRow extends Record<string, unknown> {
	readonly outcome:
		| "created"
		| "replayed"
		| "not-found"
		| "quota-exceeded"
		| "idempotency-conflict";
	readonly assetId: string | null;
	readonly usedBytes: number | string | null;
	readonly limitBytes: number | string;
}

interface FinalizeFunctionRow extends Record<string, unknown> {
	readonly outcome:
		| "ready"
		| "failed"
		| "not-found"
		| "idempotency-conflict"
		| "invalid-state";
	readonly currentStatus: string | null;
	readonly assetId: string | null;
	readonly replayed: boolean;
}

interface DeleteFunctionRow extends Record<string, unknown> {
	readonly outcome: "deleted" | "referenced" | "not-found";
}

const FAILURE_CODES = new Set<AssetFailureCode>([
	"object-missing",
	"checksum-mismatch",
	"content-type-mismatch",
	"size-mismatch",
	"media-type-mismatch",
]);

function failureCodeFromRow(value: string | null): AssetFailureCode | null {
	if (value === null) {
		return null;
	}
	if (!FAILURE_CODES.has(value as AssetFailureCode)) {
		throw new Error(`Hosted persistence returned an unknown asset failure code: ${value}`);
	}
	return value as AssetFailureCode;
}

function metadataFromRow(row: AssetRow) {
	if (row.kind === "image") {
		if (row.width === null || row.height === null) {
			throw new Error("Hosted persistence returned image metadata without dimensions");
		}
		return Asset.create({
			id: row.id,
			kind: row.kind,
			fileName: row.fileName,
			mimeType: row.mimeType,
			byteSize: row.byteSize,
			checksum: row.checksum,
			width: row.width,
			height: row.height,
		}).metadata;
	}
	if (row.kind === "video") {
		if (row.width === null || row.height === null || row.durationMs === null) {
			throw new Error("Hosted persistence returned incomplete video metadata");
		}
		return Asset.create({
			id: row.id,
			kind: row.kind,
			fileName: row.fileName,
			mimeType: row.mimeType,
			byteSize: row.byteSize,
			checksum: row.checksum,
			width: row.width,
			height: row.height,
			durationMs: row.durationMs,
		}).metadata;
	}
	if (row.durationMs === null) {
		throw new Error("Hosted persistence returned audio metadata without duration");
	}
	return Asset.create({
		id: row.id,
		kind: row.kind,
		fileName: row.fileName,
		mimeType: row.mimeType,
		byteSize: row.byteSize,
		checksum: row.checksum,
		durationMs: row.durationMs,
	}).metadata;
}

/** Revalidates persistence data before it crosses back into the application. */
export function assetRecordFromRow(row: AssetRow, ownerId: string): AssetRecord {
	if (row.uploadStatus === "deleted") {
		throw new Error("Deleted assets cannot cross the repository boundary");
	}
	return {
		id: row.id,
		ownerId,
		projectId: row.projectId,
		objectKey: row.objectKey,
		metadata: metadataFromRow(row),
		status: row.uploadStatus === "uploaded" ? "pending" : row.uploadStatus,
		reserveIdempotencyKey: row.reserveIdempotencyKey,
		finalizeIdempotencyKey: row.finalizeIdempotencyKey,
		verifiedChecksum: row.verifiedChecksum,
		failureCode: failureCodeFromRow(row.failureCode),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		readyAt: row.readyAt,
	};
}

function safeInteger(value: number | string, label: string): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`Hosted persistence returned an invalid ${label}`);
	}
	return parsed;
}

function dateValue(value: Date | string, label: string): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(parsed.getTime())) {
		throw new Error(`Hosted persistence returned an invalid ${label}`);
	}
	return parsed;
}

function nullableDateValue(value: Date | string | null, label: string): Date | null {
	return value === null ? null : dateValue(value, label);
}

function assetRecordFromRawRow(row: RawAssetRow): AssetRecord {
	return assetRecordFromRow(
		{
			...row,
			byteSize: safeInteger(row.byteSize, "asset byte size"),
			createdAt: dateValue(row.createdAt, "asset creation time"),
			updatedAt: dateValue(row.updatedAt, "asset update time"),
			readyAt: nullableDateValue(row.readyAt, "asset ready time"),
			deletedAt: nullableDateValue(row.deletedAt, "asset deletion time"),
		},
		row.ownerId,
	);
}

async function executeRows<T extends Record<string, unknown>>(
	db: CreatorDatabase,
	statement: SQL,
): Promise<readonly T[]> {
	const result = await db.execute<T>(statement);
	return result.rows as readonly T[];
}

const ASSET_ROW_SELECTION = sql.raw(`
	a.id AS "id",
	p.owner_id AS "ownerId",
	a.project_id AS "projectId",
	a.kind AS "kind",
	a.file_name AS "fileName",
	a.mime_type AS "mimeType",
	a.byte_size AS "byteSize",
	a.object_key AS "objectKey",
	a.reserve_idempotency_key AS "reserveIdempotencyKey",
	a.finalize_idempotency_key AS "finalizeIdempotencyKey",
	a.checksum AS "checksum",
	a.verified_checksum AS "verifiedChecksum",
	a.width AS "width",
	a.height AS "height",
	a.duration_ms AS "durationMs",
	a.upload_status AS "uploadStatus",
	a.failure_code AS "failureCode",
	a.created_at AS "createdAt",
	a.updated_at AS "updatedAt",
	a.ready_at AS "readyAt",
	a.deleted_at AS "deletedAt"
`);

async function findOwned(
	db: CreatorDatabase,
	ownerId: string,
	id: string,
): Promise<AssetRecord | null> {
	const rows = await executeRows<RawAssetRow>(
		db,
		sql`SELECT ${ASSET_ROW_SELECTION}
			FROM assets a
			INNER JOIN projects p ON p.id = a.project_id
			WHERE a.id = ${id}
				AND p.owner_id = ${ownerId}
				AND a.upload_status <> 'deleted'
			LIMIT 1`,
	);
	const row = rows[0];
	return row ? assetRecordFromRawRow(row) : null;
}

async function listOwned(
	db: CreatorDatabase,
	ownerId: string,
	projectId?: string,
): Promise<readonly AssetRecord[]> {
	const projectFilter = projectId ? sql`AND a.project_id = ${projectId}` : sql``;
	const rows = await executeRows<RawAssetRow>(
		db,
		sql`SELECT ${ASSET_ROW_SELECTION}
			FROM assets a
			INNER JOIN projects p ON p.id = a.project_id
			WHERE p.owner_id = ${ownerId}
				AND a.upload_status <> 'deleted'
				${projectFilter}
			ORDER BY a.created_at DESC, a.id DESC`,
	);
	return rows.map(assetRecordFromRawRow);
}

function metadataDimensions(input: ReservePendingAssetCommand): {
	readonly width: number | null;
	readonly height: number | null;
	readonly durationMs: number | null;
} {
	if (input.metadata.kind === "image") {
		return { width: input.metadata.width, height: input.metadata.height, durationMs: null };
	}
	if (input.metadata.kind === "video") {
		return {
			width: input.metadata.width,
			height: input.metadata.height,
			durationMs: input.metadata.durationMs,
		};
	}
	return { width: null, height: null, durationMs: input.metadata.durationMs };
}

async function reservePending(
	db: CreatorDatabase,
	input: ReservePendingAssetCommand,
): Promise<ReservePendingAssetResult> {
	const dimensions = metadataDimensions(input);
	const rows = await executeRows<ReserveFunctionRow>(
		db,
		sql`SELECT
			outcome,
			asset_id AS "assetId",
			used_bytes AS "usedBytes",
			limit_bytes AS "limitBytes"
		FROM typelapse_reserve_asset_v1(
			${input.id},
			${input.ownerId},
			${input.projectId},
			${input.objectKey},
			${input.metadata.kind}::asset_kind,
			${input.metadata.fileName},
			${input.metadata.mimeType},
			${input.metadata.byteSize},
			${input.metadata.checksum},
			${dimensions.width},
			${dimensions.height},
			${dimensions.durationMs},
			${input.idempotencyKey},
			${input.maxOwnerStorageBytes},
			${input.now}
		)`,
	);
	const result = rows[0];
	if (!result) {
		throw new Error("Asset reservation persistence returned no outcome");
	}
	if (result.outcome === "not-found" || result.outcome === "idempotency-conflict") {
		return { outcome: result.outcome };
	}
	if (result.outcome === "quota-exceeded") {
		if (result.usedBytes === null) {
			throw new Error("Quota outcome did not include owner usage");
		}
		return {
			outcome: result.outcome,
			usedBytes: safeInteger(result.usedBytes, "asset storage usage"),
			limitBytes: safeInteger(result.limitBytes, "asset storage limit"),
		};
	}
	if (!result.assetId) {
		throw new Error("Successful asset reservation did not return an asset id");
	}
	const asset = await findOwned(db, input.ownerId, result.assetId);
	if (!asset) {
		throw new Error("Reserved asset could not be reloaded for its owner");
	}
	return { outcome: result.outcome, asset };
}

function applicationStatus(value: string | null): AssetUploadStatus {
	if (value === "pending" || value === "uploaded") {
		return "pending";
	}
	if (value === "ready" || value === "failed") {
		return value;
	}
	throw new Error("Asset finalization persistence returned an invalid status");
}

interface FinalizeTransition {
	readonly ownerId: string;
	readonly id: string;
	readonly idempotencyKey: string;
	readonly targetStatus: "ready" | "failed";
	readonly verifiedChecksum: string | null;
	readonly failureCode: AssetFailureCode | null;
	readonly now: Date;
}

async function finalizeTransition(
	db: CreatorDatabase,
	input: FinalizeTransition,
): Promise<
	| FinalizeAssetResult
	| MarkAssetFailedResult
> {
	const rows = await executeRows<FinalizeFunctionRow>(
		db,
		sql`SELECT
			outcome,
			current_status AS "currentStatus",
			asset_id AS "assetId",
			replayed
		FROM typelapse_finalize_asset_v1(
			${input.ownerId},
			${input.id},
			${input.idempotencyKey},
			${input.targetStatus}::asset_upload_status,
			${input.verifiedChecksum},
			${input.failureCode},
			${input.now}
		)`,
	);
	const result = rows[0];
	if (!result) {
		throw new Error("Asset finalization persistence returned no outcome");
	}
	if (result.outcome === "not-found" || result.outcome === "idempotency-conflict") {
		return { outcome: result.outcome };
	}
	if (result.outcome === "invalid-state") {
		return { outcome: result.outcome, status: applicationStatus(result.currentStatus) };
	}
	if (result.outcome !== input.targetStatus || !result.assetId) {
		throw new Error("Asset finalization persistence returned a mismatched transition");
	}
	const asset = await findOwned(db, input.ownerId, result.assetId);
	if (!asset || asset.status !== input.targetStatus) {
		throw new Error("Finalized asset could not be reloaded in its terminal state");
	}
	return { outcome: input.targetStatus, asset, replayed: result.replayed };
}

function finalizeReady(
	db: CreatorDatabase,
	input: FinalizeReadyAssetCommand,
): Promise<FinalizeAssetResult> {
	return finalizeTransition(db, {
		...input,
		targetStatus: "ready",
		failureCode: null,
	}) as Promise<FinalizeAssetResult>;
}

function markFailed(
	db: CreatorDatabase,
	input: MarkAssetFailedCommand,
): Promise<MarkAssetFailedResult> {
	return finalizeTransition(db, {
		...input,
		targetStatus: "failed",
		verifiedChecksum: null,
	}) as Promise<MarkAssetFailedResult>;
}

async function deleteOwnedIfUnreferenced(
	db: CreatorDatabase,
	ownerId: string,
	id: string,
): Promise<DeleteOwnedAssetResult> {
	const rows = await executeRows<DeleteFunctionRow>(
		db,
		sql`SELECT outcome
		FROM typelapse_delete_asset_v1(${ownerId}, ${id}, ${new Date()})`,
	);
	const result = rows[0];
	if (!result) {
		throw new Error("Asset deletion persistence returned no outcome");
	}
	return { outcome: result.outcome };
}

/** Concrete PostgreSQL adapter. Atomic state transitions live in additive SQL functions. */
export function createAssetRepository(db: CreatorDatabase): AssetRepositoryPort {
	return {
		reservePending: (input) => reservePending(db, input),
		findOwnedById: (ownerId, id) => findOwned(db, ownerId, id),
		listByOwner: (ownerId, projectId) => listOwned(db, ownerId, projectId),
		finalizeReady: (input) => finalizeReady(db, input),
		markFailed: (input) => markFailed(db, input),
		deleteOwnedIfUnreferenced: (ownerId, id) =>
			deleteOwnedIfUnreferenced(db, ownerId, id),
	};
}

/** Owner-scoped canonical metadata lookup for hosted project acceptance. */
export function createHostedProjectAssetResolver(
	db: CreatorDatabase,
): HostedProjectAssetResolverPort {
	return {
		async resolveReadyForProject(input) {
			const ids = [...new Set(input.assetIds)];
			if (ids.length === 0) {
				return [];
			}
			const idList = sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `,
			);
			const rows = await executeRows<RawAssetRow>(
				db,
				sql`SELECT ${ASSET_ROW_SELECTION}
					FROM assets a
					INNER JOIN projects p ON p.id = a.project_id
					WHERE p.owner_id = ${input.ownerId}
						AND a.project_id = ${input.projectId}
						AND a.id IN (${idList})
						AND a.upload_status = 'ready'
						AND a.verified_checksum = a.checksum`,
			);
			const byId = new Map(
				rows.map((row) => {
					const asset = assetRecordFromRawRow(row);
					return [asset.id, asset] as const;
				}),
			);
			return ids.flatMap((id) => {
				const asset = byId.get(id);
				return asset ? [{ id: asset.id, metadata: asset.metadata }] : [];
			});
		},
	};
}
