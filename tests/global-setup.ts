import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../server/db/database";

/**
 * Migrates the PostgreSQL contract-test database once per run, before any test
 * file starts. Vitest runs files in parallel workers; when each one applied the
 * migrations itself, two that met an empty database together failed on the same
 * CREATE TABLE. Contract files now assume the schema is there and only scope
 * their own rows. Without TYPELAPSE_TEST_DATABASE_URL this does nothing, which
 * is also what makes those files skip.
 */
export type MigrationTarget = {
	migrate: () => Promise<void>;
	close: () => Promise<void>;
};

function openDatabase(url: string): MigrationTarget {
	const db = createDatabase(url);
	return {
		migrate: () => migrate(db, { migrationsFolder: "server/db/migrations" }),
		close: () => db.$client.end(),
	};
}

export async function migrateTestDatabase(
	url: string | undefined,
	open: (url: string) => MigrationTarget = openDatabase,
): Promise<void> {
	if (!url?.trim()) return;
	const target = open(url);
	try {
		await target.migrate();
	} finally {
		await target.close();
	}
}

export default async function setup(): Promise<void> {
	await migrateTestDatabase(process.env.TYPELAPSE_TEST_DATABASE_URL);
}
