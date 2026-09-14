CREATE TABLE "object_deletion_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_deletion_outbox_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "object_deletion_outbox_status_check" CHECK ("object_deletion_outbox"."status" IN ('pending', 'running')),
	CONSTRAINT "object_deletion_outbox_attempts_check" CHECK ("object_deletion_outbox"."attempts" >= 0),
	CONSTRAINT "object_deletion_outbox_lease_state_check" CHECK (("object_deletion_outbox"."status" = 'pending'
					AND "object_deletion_outbox"."lease_owner" IS NULL
					AND "object_deletion_outbox"."lease_expires_at" IS NULL)
				OR ("object_deletion_outbox"."status" = 'running'
					AND "object_deletion_outbox"."lease_owner" IS NOT NULL
					AND "object_deletion_outbox"."lease_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "object_deletion_outbox_claim_idx" ON "object_deletion_outbox" USING btree ("status","available_at","created_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION typelapse_delete_asset_v1(
	p_owner_id text,
	p_id text,
	p_now timestamp with time zone
)
RETURNS TABLE(outcome text, object_key text)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	v_asset assets%ROWTYPE;
	v_document jsonb;
BEGIN
	-- Match reservation lock ordering: owner advisory lock, then project/asset rows.
	-- This avoids delete-vs-reserve deadlocks while keeping quota changes serialized.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

	SELECT a.* INTO v_asset
	FROM assets a
	INNER JOIN projects p ON p.id = a.project_id
	WHERE a.id = p_id
		AND p.owner_id = p_owner_id
		AND a.upload_status <> 'deleted'
	FOR UPDATE OF a, p;

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'not-found'::text, NULL::text;
		RETURN;
	END IF;

	SELECT p.document INTO v_document
	FROM projects p
	WHERE p.id = v_asset.project_id;

	IF jsonb_path_exists(
		v_document,
		'$.project.assets[*] ? (@.id == $assetId)',
		jsonb_build_object('assetId', to_jsonb(p_id))
	) OR jsonb_path_exists(
		v_document,
		'$.project.scenes[*].blocks[*] ? (@.assetId == $assetId)',
		jsonb_build_object('assetId', to_jsonb(p_id))
	) OR jsonb_path_exists(
		v_document,
		'$.project.audioCues[*] ? (@.assetId == $assetId)',
		jsonb_build_object('assetId', to_jsonb(p_id))
	) THEN
		RETURN QUERY SELECT 'referenced'::text, NULL::text;
		RETURN;
	END IF;

	-- The cleanup intent is durable before the asset stops counting toward quota.
	-- Both writes live in this function's transaction: either both commit or neither.
	INSERT INTO object_deletion_outbox (
		id,
		object_key,
		status,
		attempts,
		available_at,
		created_at,
		updated_at
	) VALUES (
		v_asset.id,
		v_asset.object_key,
		'pending',
		0,
		p_now,
		p_now,
		p_now
	);

	UPDATE assets
	SET upload_status = 'deleted', deleted_at = p_now, updated_at = p_now
	WHERE id = p_id;

	-- Kept for SQL signature compatibility. The application adapter selects only
	-- outcome, so the private key remains inside persistence and the worker port.
	RETURN QUERY SELECT 'deleted'::text, v_asset.object_key;
END;
$$;
