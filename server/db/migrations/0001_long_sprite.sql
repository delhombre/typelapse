CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."asset_upload_status" AS ENUM('pending', 'uploaded', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."creator_plan_tier" AS ENUM('free', 'creator');--> statement-breakpoint
CREATE TYPE "public"."render_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."stripe_subscription_status" AS ENUM('none', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."stripe_webhook_event_status" AS ENUM('processing', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text NOT NULL,
	"verified_checksum" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"upload_status" "asset_upload_status" DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "assets_byte_size_positive_check" CHECK ("assets"."byte_size" > 0),
	CONSTRAINT "assets_checksum_format_check" CHECK ("assets"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "assets_dimensions_positive_check" CHECK (("assets"."width" IS NULL OR "assets"."width" > 0)
				AND ("assets"."height" IS NULL OR "assets"."height" > 0)
				AND ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" > 0)),
	CONSTRAINT "assets_ready_integrity_check" CHECK ("assets"."upload_status" <> 'ready'
				OR ("assets"."verified_checksum" IS NOT NULL AND "assets"."verified_checksum" = "assets"."checksum")),
	CONSTRAINT "assets_ready_metadata_check" CHECK ("assets"."upload_status" <> 'ready' OR CASE
				WHEN "assets"."kind" = 'image' THEN "assets"."width" IS NOT NULL AND "assets"."height" IS NOT NULL
				WHEN "assets"."kind" = 'video' THEN "assets"."width" IS NOT NULL AND "assets"."height" IS NOT NULL AND "assets"."duration_ms" IS NOT NULL
				WHEN "assets"."kind" = 'audio' THEN "assets"."duration_ms" IS NOT NULL
				ELSE false
			END),
	CONSTRAINT "assets_deleted_timestamp_check" CHECK (("assets"."upload_status" = 'deleted') = ("assets"."deleted_at" IS NOT NULL)),
	CONSTRAINT "assets_ready_timestamp_check" CHECK ("assets"."upload_status" <> 'ready' OR "assets"."ready_at" IS NOT NULL),
	CONSTRAINT "assets_failure_code_check" CHECK ("assets"."upload_status" <> 'failed' OR "assets"."failure_code" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_owner_id_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "projects_document_v2_check" CHECK ("projects"."document" ->> 'schemaVersion' = '2'),
	CONSTRAINT "projects_document_identity_check" CHECK ("projects"."id" = "projects"."document" #>> '{project,id}'),
	CONSTRAINT "projects_title_matches_document_check" CHECK (length(btrim("projects"."title")) > 0
				AND "projects"."title" = "projects"."document" #>> '{project,title}'),
	CONSTRAINT "projects_revision_positive_check" CHECK ("projects"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"project_document" jsonb NOT NULL,
	"render_options" jsonb NOT NULL,
	"render_options_hash" text NOT NULL,
	"compiler_version" text NOT NULL,
	"status" "render_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"output_object_key" text,
	"output_mime_type" text,
	"output_byte_size" bigint,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "render_jobs_request_unique" UNIQUE("project_id","revision","compiler_version","render_options_hash"),
	CONSTRAINT "render_jobs_revision_positive_check" CHECK ("render_jobs"."revision" > 0),
	CONSTRAINT "render_jobs_document_snapshot_check" CHECK ("render_jobs"."project_document" ->> 'schemaVersion' = '2'
				AND "render_jobs"."project_id" = "render_jobs"."project_document" #>> '{project,id}'),
	CONSTRAINT "render_jobs_attempts_check" CHECK ("render_jobs"."attempts" >= 0),
	CONSTRAINT "render_jobs_options_hash_check" CHECK ("render_jobs"."render_options_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "render_jobs_output_size_check" CHECK ("render_jobs"."output_byte_size" IS NULL OR "render_jobs"."output_byte_size" > 0),
	CONSTRAINT "render_jobs_lease_check" CHECK (("render_jobs"."status" = 'running') = (
				"render_jobs"."lease_owner" IS NOT NULL AND "render_jobs"."lease_expires_at" IS NOT NULL
			)
			AND ("render_jobs"."status" <> 'running' OR "render_jobs"."started_at" IS NOT NULL)),
	CONSTRAINT "render_jobs_outcome_check" CHECK (CASE
				WHEN "render_jobs"."status" = 'succeeded' THEN
					"render_jobs"."completed_at" IS NOT NULL
					AND "render_jobs"."output_object_key" IS NOT NULL
					AND "render_jobs"."output_mime_type" IS NOT NULL
					AND "render_jobs"."output_byte_size" IS NOT NULL
					AND "render_jobs"."error_code" IS NULL
					AND "render_jobs"."error_message" IS NULL
				WHEN "render_jobs"."status" = 'failed' THEN
					"render_jobs"."completed_at" IS NOT NULL
					AND "render_jobs"."error_code" IS NOT NULL
					AND "render_jobs"."output_object_key" IS NULL
					AND "render_jobs"."output_mime_type" IS NULL
					AND "render_jobs"."output_byte_size" IS NULL
				WHEN "render_jobs"."status" = 'canceled' THEN
					"render_jobs"."completed_at" IS NOT NULL
					AND "render_jobs"."output_object_key" IS NULL
					AND "render_jobs"."output_mime_type" IS NULL
					AND "render_jobs"."output_byte_size" IS NULL
				ELSE
					"render_jobs"."completed_at" IS NULL
					AND "render_jobs"."output_object_key" IS NULL
					AND "render_jobs"."output_mime_type" IS NULL
					AND "render_jobs"."output_byte_size" IS NULL
					AND "render_jobs"."error_code" IS NULL
					AND "render_jobs"."error_message" IS NULL
			END)
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "stripe_webhook_event_status" DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "stripe_webhook_events_attempts_check" CHECK ("stripe_webhook_events"."attempts" >= 0),
	CONSTRAINT "stripe_webhook_events_payload_hash_check" CHECK ("stripe_webhook_events"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "stripe_webhook_events_outcome_check" CHECK (CASE
				WHEN "stripe_webhook_events"."status" IN ('processed', 'ignored') THEN
					"stripe_webhook_events"."processed_at" IS NOT NULL AND "stripe_webhook_events"."last_error" IS NULL
				WHEN "stripe_webhook_events"."status" = 'failed' THEN
					"stripe_webhook_events"."processed_at" IS NULL AND "stripe_webhook_events"."last_error" IS NOT NULL
				ELSE "stripe_webhook_events"."processed_at" IS NULL AND "stripe_webhook_events"."last_error" IS NULL
			END)
);
--> statement-breakpoint
CREATE TABLE "subscription_projections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_tier" "creator_plan_tier" DEFAULT 'free' NOT NULL,
	"stripe_status" "stripe_subscription_status" DEFAULT 'none' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_id" text,
	"last_event_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_projections_event_cursor_check" CHECK (("subscription_projections"."last_event_id" IS NULL) = ("subscription_projections"."last_event_created_at" IS NULL)),
	CONSTRAINT "subscription_projections_creator_identity_check" CHECK ("subscription_projections"."plan_tier" <> 'creator' OR (
				"subscription_projections"."stripe_customer_id" IS NOT NULL
				AND "subscription_projections"."stripe_subscription_id" IS NOT NULL
				AND "subscription_projections"."stripe_price_id" IS NOT NULL
				AND "subscription_projections"."stripe_status" IN ('active', 'trialing')
			)),
	CONSTRAINT "subscription_projections_creator_period_check" CHECK ("subscription_projections"."plan_tier" <> 'creator' OR "subscription_projections"."current_period_end" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_owner_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_projections" ADD CONSTRAINT "subscription_projections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_status_idx" ON "assets" USING btree ("project_id","upload_status");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "render_jobs_output_object_key_unique" ON "render_jobs" USING btree ("output_object_key") WHERE "render_jobs"."output_object_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "render_jobs_status_available_idx" ON "render_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "render_jobs_owner_created_idx" ON "render_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_received_idx" ON "stripe_webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_projections_stripe_customer_unique" ON "subscription_projections" USING btree ("stripe_customer_id") WHERE "subscription_projections"."stripe_customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_projections_stripe_subscription_unique" ON "subscription_projections" USING btree ("stripe_subscription_id") WHERE "subscription_projections"."stripe_subscription_id" IS NOT NULL;