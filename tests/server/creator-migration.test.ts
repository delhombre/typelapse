import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("server/db/migrations/0001_long_sprite.sql"), "utf8");

describe("Creator hosted migration", () => {
	it("creates the complete persistence slice", () => {
		for (const table of [
			"projects",
			"assets",
			"subscription_projections",
			"stripe_webhook_events",
			"render_jobs",
		]) {
			expect(migration).toContain(`CREATE TABLE "${table}"`);
		}
		expect(migration).toContain("render_jobs_request_unique");
		expect(migration).toContain("projects_document_v2_check");
		expect(migration).toContain('"project_document" jsonb NOT NULL');
	});

	it("is additive and leaves Better Auth tables untouched", () => {
		expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
		expect(migration).not.toContain('CREATE TABLE "user"');
		expect(migration).not.toContain('ALTER TABLE "user"');
		expect(migration).not.toContain('ALTER TABLE "session"');
		expect(migration).not.toContain('ALTER TABLE "account"');
		expect(migration).not.toContain('ALTER TABLE "verification"');
	});
});
