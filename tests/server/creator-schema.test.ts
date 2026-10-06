import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	account,
	apiKeys,
	assetKind,
	assetUploadStatus,
	assets,
	creatorPlanTier,
	projects,
	renderJobStatus,
	renderJobs,
	session,
	billingSubscriptionStatus,
	billingWebhookEventStatus,
	billingWebhookEvents,
	subscriptionProjections,
	user,
	verification,
} from "../../server/db/schema";

function constraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
	const config = getTableConfig(table);
	return [
		...config.checks.map((check) => check.name),
		...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
		...config.uniqueConstraints.map((constraint) => constraint.name),
		...config.indexes.map((index) => index.config.name),
	].filter((name): name is string => typeof name === "string");
}

describe("Creator hosted database schema", () => {
	it("keeps every Better Auth table exported unchanged", () => {
		expect([user, session, account, verification].map(getTableName)).toEqual([
			"user",
			"session",
			"account",
			"verification",
		]);
		expect(user.email.notNull).toBe(true);
		expect(session.token.isUnique).toBe(true);
	});

	it("stores owned V2 documents behind an optimistic revision", () => {
		expect(projects.document.columnType).toContain("Jsonb");
		expect(projects.ownerId.notNull).toBe(true);
		expect(projects.revision.notNull).toBe(true);
		expect(projects.revision.hasDefault).toBe(true);
		expect(constraintNames(projects)).toEqual(
			expect.arrayContaining([
				"projects_owner_id_user_id_fk",
				"projects_document_v2_check",
				"projects_document_identity_check",
				"projects_title_matches_document_check",
				"projects_revision_positive_check",
				"projects_id_owner_id_unique",
				"projects_owner_updated_idx",
			]),
		);
	});

	it("tells a regular project from an automation one with a flag a writer must ask for", () => {
		expect(projects.automation.notNull).toBe(true);
		expect(projects.automation.hasDefault).toBe(true);
		// A writer that says nothing writes a regular project, which counts toward the
		// ceiling: the exemption is opt-in.
		expect(projects.automation.default).toBe(false);
	});

	it("models asset identity, object storage and verification lifecycle", () => {
		expect(assetKind.enumValues).toEqual(["image", "video", "audio"]);
		expect(assetUploadStatus.enumValues).toEqual([
			"pending",
			"uploaded",
			"ready",
			"failed",
			"deleted",
		]);
		expect(assets.objectKey.notNull).toBe(true);
		expect(assets.checksum.notNull).toBe(true);
		expect(assets.verifiedChecksum.notNull).toBe(false);
		expect(constraintNames(assets)).toEqual(
			expect.arrayContaining([
				"assets_project_id_projects_id_fk",
				"assets_object_key_unique",
				"assets_ready_integrity_check",
				"assets_ready_metadata_check",
				"assets_deleted_timestamp_check",
				"assets_checksum_format_check",
				"assets_project_status_idx",
			]),
		);
	});

	it("keeps the subscription projection separate from its idempotent event ledger", () => {
		expect(creatorPlanTier.enumValues).toEqual(["free", "creator"]);
		expect(billingSubscriptionStatus.enumValues).toContain("incomplete_expired");
		expect(billingWebhookEventStatus.enumValues).toEqual([
			"processing",
			"processed",
			"failed",
			"ignored",
		]);
		expect(subscriptionProjections.userId.primary).toBe(true);
		expect(billingWebhookEvents.id.primary).toBe(true);
		expect(constraintNames(subscriptionProjections)).toEqual(
			expect.arrayContaining([
				"subscription_projections_user_id_user_id_fk",
				"subscription_projections_provider_customer_unique",
				"subscription_projections_provider_subscription_unique",
				"subscription_projections_event_cursor_check",
				"subscription_projections_creator_period_check",
			]),
		);
		expect(constraintNames(billingWebhookEvents)).toEqual(
			expect.arrayContaining([
				"billing_webhook_events_attempts_check",
				"billing_webhook_events_payload_hash_check",
				"billing_webhook_events_outcome_check",
			]),
		);
	});

	it("keeps an API key as a public prefix and the hash of its secret, owned by an account", () => {
		expect(apiKeys.prefix.primary).toBe(true);
		expect(apiKeys.ownerId.notNull).toBe(true);
		expect(apiKeys.secretHash.notNull).toBe(true);
		expect(apiKeys.expiresAt.notNull).toBe(false);
		expect(apiKeys.lastUsedAt.notNull).toBe(false);
		// Nothing in the table can hold the secret itself.
		expect(Object.keys(apiKeys).filter((column) => /secret|token|^key$/i.test(column))).toEqual([
			"secretHash",
		]);
		expect(constraintNames(apiKeys)).toEqual(
			expect.arrayContaining([
				"api_keys_owner_id_user_id_fk",
				"api_keys_prefix_format_check",
				"api_keys_name_check",
				"api_keys_secret_hash_check",
				"api_keys_expiry_check",
				"api_keys_owner_created_idx",
			]),
		);
	});

	it("persists a canonical render request, lease and terminal outcome", () => {
		expect(renderJobStatus.enumValues).toEqual([
			"queued",
			"running",
			"succeeded",
			"failed",
			"canceled",
		]);
		expect(renderJobs.renderOptions.columnType).toContain("Jsonb");
		expect(renderJobs.projectDocument.columnType).toContain("Jsonb");
		expect(renderJobs.compilerVersion.notNull).toBe(true);
		expect(renderJobs.renderOptionsHash.notNull).toBe(true);
		expect(constraintNames(renderJobs)).toEqual(
			expect.arrayContaining([
				"render_jobs_project_owner_fk",
				"render_jobs_request_unique",
				"render_jobs_revision_positive_check",
				"render_jobs_document_snapshot_check",
				"render_jobs_options_hash_check",
				"render_jobs_lease_check",
				"render_jobs_outcome_check",
				"render_jobs_output_object_key_unique",
				"render_jobs_status_available_idx",
			]),
		);
	});
});
