-- IF NOT EXISTS keeps a re-run harmless on a database that already has the column.
-- The default makes every project already there a regular one, which still counts toward the ceiling.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "automation" boolean DEFAULT false NOT NULL;
