CREATE TABLE "render_usage" (
	"job_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "render_usage_duration_check" CHECK ("render_usage"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "render_usage" ADD CONSTRAINT "render_usage_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_usage_owner_accepted_idx" ON "render_usage" USING btree ("owner_id","accepted_at");
--> statement-breakpoint
-- The jobs already there are the ledger's first entries: what the month counted before (queued, running or succeeded, with a length) is what it counts now. ON CONFLICT keeps a re-run harmless.
INSERT INTO "render_usage" ("job_id", "owner_id", "duration_ms", "accepted_at")
SELECT "id", "owner_id", "duration_ms", "created_at"
FROM "render_jobs"
WHERE "duration_ms" IS NOT NULL AND "status" IN ('queued', 'running', 'succeeded')
ON CONFLICT ("job_id") DO NOTHING;
