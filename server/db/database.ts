import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type CreatorDatabase = NodePgDatabase<typeof schema> & {
	readonly $client: Pool;
};

export function createDatabase(databaseUrl: string): CreatorDatabase {
	if (!databaseUrl.trim()) {
		throw new Error("DATABASE_URL must not be empty");
	}
	const pool = new Pool({ connectionString: databaseUrl });
	return drizzle(pool, { schema });
}

export function databaseFromEnv(
	env: Readonly<Record<string, string | undefined>> = process.env,
): CreatorDatabase | null {
	return env.DATABASE_URL ? createDatabase(env.DATABASE_URL) : null;
}
