-- IF NOT EXISTS keeps a re-run harmless on a database that already has the columns.
-- Every render starts private: a public page exists only once its owner turns it on.
ALTER TABLE "render_jobs" ADD COLUMN IF NOT EXISTS "output_poster_key" text;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
