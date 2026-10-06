import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("server/db/migrations/0001_long_sprite.sql"), "utf8");

const apiKeysMigration = readFileSync(resolve("server/db/migrations/0006_api_keys.sql"), "utf8");

const automationMigration = readFileSync(
	resolve("server/db/migrations/0007_automation_projects.sql"),
	"utf8",
);

describe("API keys migration", () => {
	it("adds one table owned by an account and drops nothing", () => {
		expect(apiKeysMigration).toContain('CREATE TABLE "api_keys"');
		expect(apiKeysMigration).toContain(
			'FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade',
		);
		expect(apiKeysMigration).not.toMatch(/DROP |ALTER TABLE "(?!api_keys)/);
	});

	it("stores a hash of the secret and no column that could hold the secret", () => {
		expect(apiKeysMigration).toContain('"secret_hash" text NOT NULL');
		expect(apiKeysMigration).toContain("secret_hash\" ~ '^[0-9a-f]{64}$'");
		expect(apiKeysMigration).not.toMatch(/"(?:key|secret|token|api_key)" /);
	});
});

describe("automation projects migration", () => {
	it("adds one flag to projects and leaves every project already there regular", () => {
		expect(automationMigration).toMatch(
			/ALTER TABLE "projects" ADD COLUMN (?:IF NOT EXISTS )?"automation" boolean DEFAULT false NOT NULL/,
		);
		// The default is what makes the rows that exist count: nothing is rewritten or dropped.
		expect(automationMigration).not.toMatch(/DROP |UPDATE |DELETE |TRUNCATE /);
	});
});

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
