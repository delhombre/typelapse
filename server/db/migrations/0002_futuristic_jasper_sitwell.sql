ALTER TABLE "assets" ADD COLUMN "reserve_idempotency_key" text;--> statement-breakpoint
UPDATE assets SET reserve_idempotency_key = 'legacy:' || id WHERE reserve_idempotency_key IS NULL;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "reserve_idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "finalize_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_reserve_idempotency_unique" UNIQUE("project_id","reserve_idempotency_key");--> statement-breakpoint

CREATE OR REPLACE FUNCTION typelapse_reserve_asset_v1(
	p_id text,
	p_owner_id text,
	p_project_id text,
	p_object_key text,
	p_kind asset_kind,
	p_file_name text,
	p_mime_type text,
	p_byte_size bigint,
	p_checksum text,
	p_width integer,
	p_height integer,
	p_duration_ms integer,
	p_idempotency_key text,
	p_max_owner_storage_bytes bigint,
	p_now timestamp with time zone
)
RETURNS TABLE(outcome text, asset_id text, used_bytes bigint, limit_bytes bigint)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	v_existing assets%ROWTYPE;
	v_used_bytes bigint;
BEGIN
	-- Serialize reservations before reading owner usage. VOLATILE PL/pgSQL SQL
	-- commands observe the reservation that committed before this lock cleared.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

	IF NOT EXISTS (
		SELECT 1 FROM projects p
		WHERE p.id = p_project_id AND p.owner_id = p_owner_id
	) THEN
		RETURN QUERY SELECT 'not-found'::text, NULL::text, NULL::bigint, p_max_owner_storage_bytes;
		RETURN;
	END IF;

	SELECT a.* INTO v_existing
	FROM assets a
	WHERE a.project_id = p_project_id
		AND a.reserve_idempotency_key = p_idempotency_key;

	IF FOUND THEN
		IF v_existing.upload_status <> 'deleted'
			AND v_existing.kind = p_kind
			AND v_existing.file_name = p_file_name
			AND v_existing.mime_type = p_mime_type
			AND v_existing.byte_size = p_byte_size
			AND v_existing.checksum = p_checksum
			AND v_existing.width IS NOT DISTINCT FROM p_width
			AND v_existing.height IS NOT DISTINCT FROM p_height
			AND v_existing.duration_ms IS NOT DISTINCT FROM p_duration_ms
		THEN
			RETURN QUERY SELECT 'replayed'::text, v_existing.id, NULL::bigint, p_max_owner_storage_bytes;
		ELSE
			RETURN QUERY SELECT 'idempotency-conflict'::text, NULL::text, NULL::bigint, p_max_owner_storage_bytes;
		END IF;
		RETURN;
	END IF;

	SELECT COALESCE(SUM(a.byte_size), 0)::bigint INTO v_used_bytes
	FROM assets a
	INNER JOIN projects p ON p.id = a.project_id
	WHERE p.owner_id = p_owner_id AND a.upload_status <> 'deleted';

	IF v_used_bytes + p_byte_size > p_max_owner_storage_bytes THEN
		RETURN QUERY SELECT 'quota-exceeded'::text, NULL::text, v_used_bytes, p_max_owner_storage_bytes;
		RETURN;
	END IF;

	BEGIN
		INSERT INTO assets (
			id, project_id, kind, file_name, mime_type, byte_size, object_key,
			reserve_idempotency_key, checksum, width, height, duration_ms,
			upload_status, created_at, updated_at
		) VALUES (
			p_id, p_project_id, p_kind, p_file_name, p_mime_type, p_byte_size,
			p_object_key, p_idempotency_key, p_checksum, p_width, p_height,
			p_duration_ms, 'pending', p_now, p_now
		);
	EXCEPTION WHEN unique_violation THEN
		RETURN QUERY SELECT 'idempotency-conflict'::text, NULL::text, NULL::bigint, p_max_owner_storage_bytes;
		RETURN;
	END;

	RETURN QUERY SELECT 'created'::text, p_id, NULL::bigint, p_max_owner_storage_bytes;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION typelapse_finalize_asset_v1(
	p_owner_id text,
	p_id text,
	p_idempotency_key text,
	p_target_status asset_upload_status,
	p_verified_checksum text,
	p_failure_code text,
	p_now timestamp with time zone
)
RETURNS TABLE(outcome text, current_status text, asset_id text, replayed boolean)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	v_asset assets%ROWTYPE;
BEGIN
	IF p_target_status NOT IN ('ready', 'failed') THEN
		RAISE EXCEPTION 'Unsupported final asset status: %', p_target_status;
	END IF;

	SELECT a.* INTO v_asset
	FROM assets a
	INNER JOIN projects p ON p.id = a.project_id
	WHERE a.id = p_id
		AND p.owner_id = p_owner_id
		AND a.upload_status <> 'deleted'
	FOR UPDATE OF a;

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'not-found'::text, NULL::text, NULL::text, false;
		RETURN;
	END IF;

	IF v_asset.finalize_idempotency_key IS NOT NULL THEN
		IF v_asset.finalize_idempotency_key <> p_idempotency_key THEN
			RETURN QUERY SELECT 'idempotency-conflict'::text, v_asset.upload_status::text, NULL::text, false;
		ELSIF p_target_status = 'ready'
			AND v_asset.upload_status = 'ready'
			AND v_asset.verified_checksum = p_verified_checksum
		THEN
			RETURN QUERY SELECT 'ready'::text, 'ready'::text, v_asset.id, true;
		ELSIF p_target_status = 'failed'
			AND v_asset.upload_status = 'failed'
			AND v_asset.failure_code = p_failure_code
		THEN
			RETURN QUERY SELECT 'failed'::text, 'failed'::text, v_asset.id, true;
		ELSE
			RETURN QUERY SELECT 'idempotency-conflict'::text, v_asset.upload_status::text, NULL::text, false;
		END IF;
		RETURN;
	END IF;

	IF v_asset.upload_status NOT IN ('pending', 'uploaded') THEN
		RETURN QUERY SELECT 'invalid-state'::text, v_asset.upload_status::text, NULL::text, false;
		RETURN;
	END IF;

	UPDATE assets
	SET upload_status = p_target_status,
		finalize_idempotency_key = p_idempotency_key,
		verified_checksum = CASE WHEN p_target_status = 'ready' THEN p_verified_checksum ELSE NULL END,
		failure_code = CASE WHEN p_target_status = 'failed' THEN p_failure_code ELSE NULL END,
		ready_at = CASE WHEN p_target_status = 'ready' THEN p_now ELSE NULL END,
		updated_at = p_now
	WHERE id = p_id;

	RETURN QUERY SELECT p_target_status::text, p_target_status::text, p_id, false;
END;
$$;--> statement-breakpoint

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

	PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id, 0));

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

	UPDATE assets
	SET upload_status = 'deleted', deleted_at = p_now, updated_at = p_now
	WHERE id = p_id;

	RETURN QUERY SELECT 'deleted'::text, v_asset.object_key;
END;
$$;
