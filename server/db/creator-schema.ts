import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import {
	ASSET_KINDS,
	ASSET_UPLOAD_STATUSES,
	CREATOR_PLAN_TIERS,
	RENDER_JOB_STATUSES,
	STRIPE_SUBSCRIPTION_STATUSES,
	STRIPE_WEBHOOK_EVENT_STATUSES,
	type RenderOptions,
} from "./persistence-values";

export interface PersistedProjectDocumentV2 {
	readonly schemaVersion: 2;
	readonly project: unknown;
}

export const assetKind = pgEnum("asset_kind", ASSET_KINDS);
export const assetUploadStatus = pgEnum("asset_upload_status", ASSET_UPLOAD_STATUSES);
export const creatorPlanTier = pgEnum("creator_plan_tier", CREATOR_PLAN_TIERS);
export const stripeSubscriptionStatus = pgEnum(
	"stripe_subscription_status",
	STRIPE_SUBSCRIPTION_STATUSES,
);
export const stripeWebhookEventStatus = pgEnum(
	"stripe_webhook_event_status",
	STRIPE_WEBHOOK_EVENT_STATUSES,
);
export const renderJobStatus = pgEnum("render_job_status", RENDER_JOB_STATUSES);

const hostedTimestamp = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		document: jsonb("document").$type<PersistedProjectDocumentV2>().notNull(),
		revision: integer("revision").default(1).notNull(),
		/**
		 * A project only render by URL has written. The cloud-project ceiling counts
		 * the others, and a save from the studio makes an automation project regular.
		 * The default keeps every writer that does not say counted.
		 */
		automation: boolean("automation").default(false).notNull(),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		updatedAt: hostedTimestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		check("projects_document_v2_check", sql`${table.document} ->> 'schemaVersion' = '2'`),
		check(
			"projects_document_identity_check",
			sql`${table.id} = ${table.document} #>> '{project,id}'`,
		),
		check(
			"projects_title_matches_document_check",
			sql`length(btrim(${table.title})) > 0
				AND ${table.title} = ${table.document} #>> '{project,title}'`,
		),
		check("projects_revision_positive_check", sql`${table.revision} > 0`),
		unique("projects_id_owner_id_unique").on(table.id, table.ownerId),
		index("projects_owner_updated_idx").on(table.ownerId, table.updatedAt),
	],
);

export const assets = pgTable(
	"assets",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		kind: assetKind("kind").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: bigint("byte_size", { mode: "number" }).notNull(),
		objectKey: text("object_key").notNull(),
		reserveIdempotencyKey: text("reserve_idempotency_key").notNull(),
		finalizeIdempotencyKey: text("finalize_idempotency_key"),
		/** Checksum claimed when reserving the upload. */
		checksum: text("checksum").notNull(),
		/** Checksum independently computed after object storage receives the bytes. */
		verifiedChecksum: text("verified_checksum"),
		width: integer("width"),
		height: integer("height"),
		durationMs: integer("duration_ms"),
		uploadStatus: assetUploadStatus("upload_status").default("pending").notNull(),
		failureCode: text("failure_code"),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		updatedAt: hostedTimestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		readyAt: hostedTimestamp("ready_at"),
		deletedAt: hostedTimestamp("deleted_at"),
	},
	(table) => [
		unique("assets_object_key_unique").on(table.objectKey),
		unique("assets_project_reserve_idempotency_unique").on(
			table.projectId,
			table.reserveIdempotencyKey,
		),
		check("assets_byte_size_positive_check", sql`${table.byteSize} > 0`),
		check("assets_checksum_format_check", sql`${table.checksum} ~ '^[0-9a-f]{64}$'`),
		check(
			"assets_dimensions_positive_check",
			sql`(${table.width} IS NULL OR ${table.width} > 0)
				AND (${table.height} IS NULL OR ${table.height} > 0)
				AND (${table.durationMs} IS NULL OR ${table.durationMs} > 0)`,
		),
		check(
			"assets_ready_integrity_check",
			sql`${table.uploadStatus} <> 'ready'
				OR (${table.verifiedChecksum} IS NOT NULL AND ${table.verifiedChecksum} = ${table.checksum})`,
		),
		check(
			"assets_ready_metadata_check",
			sql`${table.uploadStatus} <> 'ready' OR CASE
				WHEN ${table.kind} = 'image' THEN ${table.width} IS NOT NULL AND ${table.height} IS NOT NULL
				WHEN ${table.kind} = 'video' THEN ${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND ${table.durationMs} IS NOT NULL
				WHEN ${table.kind} = 'audio' THEN ${table.durationMs} IS NOT NULL
				ELSE false
			END`,
		),
		check(
			"assets_deleted_timestamp_check",
			sql`(${table.uploadStatus} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
		),
		check(
			"assets_ready_timestamp_check",
			sql`${table.uploadStatus} <> 'ready' OR ${table.readyAt} IS NOT NULL`,
		),
		check(
			"assets_failure_code_check",
			sql`${table.uploadStatus} <> 'failed' OR ${table.failureCode} IS NOT NULL`,
		),
		index("assets_project_status_idx").on(table.projectId, table.uploadStatus),
	],
);

/**
 * Transactional outbox for private object cleanup. Deliberately no asset FK:
 * cleanup must survive later project/asset-row removal until storage confirms.
 */
export const objectDeletionOutbox = pgTable(
	"object_deletion_outbox",
	{
		id: text("id").primaryKey(),
		objectKey: text("object_key").notNull(),
		status: text("status").$type<"pending" | "running">().default("pending").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		availableAt: hostedTimestamp("available_at").defaultNow().notNull(),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: hostedTimestamp("lease_expires_at"),
		lastError: text("last_error"),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		updatedAt: hostedTimestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		unique("object_deletion_outbox_object_key_unique").on(table.objectKey),
		check(
			"object_deletion_outbox_status_check",
			sql`${table.status} IN ('pending', 'running')`,
		),
		check("object_deletion_outbox_attempts_check", sql`${table.attempts} >= 0`),
		check(
			"object_deletion_outbox_lease_state_check",
			sql`(${table.status} = 'pending'
					AND ${table.leaseOwner} IS NULL
					AND ${table.leaseExpiresAt} IS NULL)
				OR (${table.status} = 'running'
					AND ${table.leaseOwner} IS NOT NULL
					AND ${table.leaseExpiresAt} IS NOT NULL)`,
		),
		index("object_deletion_outbox_claim_idx").on(
			table.status,
			table.availableAt,
			table.createdAt,
		),
	],
);

/**
 * API keys: a second credential for the hosted render routes, made in the
 * account island. The prefix is public and is the key's identity; the secret is
 * never stored, only a SHA-256 hash of it. Revoking deletes the row, so a
 * revoked key and an unknown one are the same thing to the guard.
 */
export const apiKeys = pgTable(
	"api_keys",
	{
		prefix: text("prefix").primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		secretHash: text("secret_hash").notNull(),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		expiresAt: hostedTimestamp("expires_at"),
		/** Precise to the minute: written at most once a minute per key. */
		lastUsedAt: hostedTimestamp("last_used_at"),
	},
	(table) => [
		check("api_keys_prefix_format_check", sql`${table.prefix} ~ '^tlk_[0-9a-f]{8}$'`),
		check(
			"api_keys_name_check",
			sql`char_length(${table.name}) BETWEEN 1 AND 60 AND ${table.name} = btrim(${table.name})`,
		),
		check("api_keys_secret_hash_check", sql`${table.secretHash} ~ '^[0-9a-f]{64}$'`),
		check(
			"api_keys_expiry_check",
			sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`,
		),
		index("api_keys_owner_created_idx").on(table.ownerId, table.createdAt),
	],
);

export const subscriptionProjections = pgTable(
	"subscription_projections",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		planTier: creatorPlanTier("plan_tier").default("free").notNull(),
		stripeStatus: stripeSubscriptionStatus("stripe_status").default("none").notNull(),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		stripePriceId: text("stripe_price_id"),
		currentPeriodEnd: hostedTimestamp("current_period_end"),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
		lastEventId: text("last_event_id"),
		lastEventCreatedAt: hostedTimestamp("last_event_created_at"),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		updatedAt: hostedTimestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("subscription_projections_stripe_customer_unique")
			.on(table.stripeCustomerId)
			.where(sql`${table.stripeCustomerId} IS NOT NULL`),
		uniqueIndex("subscription_projections_stripe_subscription_unique")
			.on(table.stripeSubscriptionId)
			.where(sql`${table.stripeSubscriptionId} IS NOT NULL`),
		check(
			"subscription_projections_event_cursor_check",
			sql`(${table.lastEventId} IS NULL) = (${table.lastEventCreatedAt} IS NULL)`,
		),
		check(
			"subscription_projections_creator_identity_check",
			sql`${table.planTier} <> 'creator' OR (
				${table.stripeCustomerId} IS NOT NULL
				AND ${table.stripeSubscriptionId} IS NOT NULL
				AND ${table.stripePriceId} IS NOT NULL
				AND ${table.stripeStatus} IN ('active', 'trialing')
			)`,
		),
		check(
			"subscription_projections_creator_period_check",
			sql`${table.planTier} <> 'creator' OR ${table.currentPeriodEnd} IS NOT NULL`,
		),
	],
);

export const stripeWebhookEvents = pgTable(
	"stripe_webhook_events",
	{
		id: text("id").primaryKey(),
		type: text("type").notNull(),
		livemode: boolean("livemode").notNull(),
		stripeCreatedAt: hostedTimestamp("stripe_created_at").notNull(),
		payloadHash: text("payload_hash").notNull(),
		status: stripeWebhookEventStatus("status").default("processing").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		receivedAt: hostedTimestamp("received_at").defaultNow().notNull(),
		processedAt: hostedTimestamp("processed_at"),
		lastError: text("last_error"),
	},
	(table) => [
		check("stripe_webhook_events_attempts_check", sql`${table.attempts} >= 0`),
		check("stripe_webhook_events_payload_hash_check", sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`),
		check(
			"stripe_webhook_events_outcome_check",
			sql`CASE
				WHEN ${table.status} IN ('processed', 'ignored') THEN
					${table.processedAt} IS NOT NULL AND ${table.lastError} IS NULL
				WHEN ${table.status} = 'failed' THEN
					${table.processedAt} IS NULL AND ${table.lastError} IS NOT NULL
				ELSE ${table.processedAt} IS NULL AND ${table.lastError} IS NULL
			END`,
		),
		index("stripe_webhook_events_status_received_idx").on(table.status, table.receivedAt),
	],
);

export const renderJobs = pgTable(
	"render_jobs",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerId: text("owner_id").notNull(),
		revision: integer("revision").notNull(),
		/**
		 * Immutable submission snapshot. The hosted adapter must copy it from the
		 * owner-scoped project row after checking `revision`; client JSON is never
		 * authoritative here.
		 */
		projectDocument: jsonb("project_document").$type<PersistedProjectDocumentV2>().notNull(),
		renderOptions: jsonb("render_options").$type<RenderOptions>().notNull(),
		renderOptionsHash: text("render_options_hash").notNull(),
		compilerVersion: text("compiler_version").notNull(),
		/**
		 * Output length in milliseconds, computed from the snapshot at submission.
		 * The monthly render minutes sum it; rows from before the quota are NULL
		 * and count as zero.
		 */
		durationMs: integer("duration_ms"),
		status: renderJobStatus("status").default("queued").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		availableAt: hostedTimestamp("available_at").defaultNow().notNull(),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: hostedTimestamp("lease_expires_at"),
		outputObjectKey: text("output_object_key"),
		outputMimeType: text("output_mime_type"),
		outputByteSize: bigint("output_byte_size", { mode: "number" }),
		/** A still of the output for its public page; best effort, so it may stay NULL. */
		outputPosterKey: text("output_poster_key"),
		/** The owner's public page switch (`/v/<id>`); every render starts private. */
		isPublic: boolean("is_public").default(false).notNull(),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		createdAt: hostedTimestamp("created_at").defaultNow().notNull(),
		updatedAt: hostedTimestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		startedAt: hostedTimestamp("started_at"),
		completedAt: hostedTimestamp("completed_at"),
	},
	(table) => [
		foreignKey({
			name: "render_jobs_project_owner_fk",
			columns: [table.projectId, table.ownerId],
			foreignColumns: [projects.id, projects.ownerId],
		}).onDelete("cascade"),
		unique("render_jobs_request_unique").on(
			table.projectId,
			table.revision,
			table.compilerVersion,
			table.renderOptionsHash,
		),
		uniqueIndex("render_jobs_output_object_key_unique")
			.on(table.outputObjectKey)
			.where(sql`${table.outputObjectKey} IS NOT NULL`),
		check("render_jobs_revision_positive_check", sql`${table.revision} > 0`),
		check(
			"render_jobs_document_snapshot_check",
			sql`${table.projectDocument} ->> 'schemaVersion' = '2'
				AND ${table.projectId} = ${table.projectDocument} #>> '{project,id}'`,
		),
		check("render_jobs_attempts_check", sql`${table.attempts} >= 0`),
		check("render_jobs_options_hash_check", sql`${table.renderOptionsHash} ~ '^[0-9a-f]{64}$'`),
		check(
			"render_jobs_output_size_check",
			sql`${table.outputByteSize} IS NULL OR ${table.outputByteSize} > 0`,
		),
		check(
			"render_jobs_lease_check",
			sql`(${table.status} = 'running') = (
				${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL
			)
			AND (${table.status} <> 'running' OR ${table.startedAt} IS NOT NULL)`,
		),
		check(
			"render_jobs_outcome_check",
			sql`CASE
				WHEN ${table.status} = 'succeeded' THEN
					${table.completedAt} IS NOT NULL
					AND ${table.outputObjectKey} IS NOT NULL
					AND ${table.outputMimeType} IS NOT NULL
					AND ${table.outputByteSize} IS NOT NULL
					AND ${table.errorCode} IS NULL
					AND ${table.errorMessage} IS NULL
				WHEN ${table.status} = 'failed' THEN
					${table.completedAt} IS NOT NULL
					AND ${table.errorCode} IS NOT NULL
					AND ${table.outputObjectKey} IS NULL
					AND ${table.outputMimeType} IS NULL
					AND ${table.outputByteSize} IS NULL
				WHEN ${table.status} = 'canceled' THEN
					${table.completedAt} IS NOT NULL
					AND ${table.outputObjectKey} IS NULL
					AND ${table.outputMimeType} IS NULL
					AND ${table.outputByteSize} IS NULL
				ELSE
					${table.completedAt} IS NULL
					AND ${table.outputObjectKey} IS NULL
					AND ${table.outputMimeType} IS NULL
					AND ${table.outputByteSize} IS NULL
					AND ${table.errorCode} IS NULL
					AND ${table.errorMessage} IS NULL
			END`,
		),
		index("render_jobs_status_available_idx").on(table.status, table.availableAt),
		index("render_jobs_owner_created_idx").on(table.ownerId, table.createdAt),
	],
);
