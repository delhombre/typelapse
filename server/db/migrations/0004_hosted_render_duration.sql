-- IF NOT EXISTS keeps a re-run harmless on a database that already has the column.
ALTER TABLE "render_jobs" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
