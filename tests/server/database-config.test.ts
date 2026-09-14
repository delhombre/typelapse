import { describe, expect, it } from "vitest";
import { createDatabase, databaseFromEnv } from "../../server/db/database";

describe("hosted database configuration", () => {
	it("keeps the local product backend-free when DATABASE_URL is absent", () => {
		expect(databaseFromEnv({})).toBeNull();
	});

	it("rejects an explicitly empty database URL", () => {
		expect(() => createDatabase(" ")).toThrow("DATABASE_URL");
	});

	it("uses a standard PostgreSQL pool so local and hosted databases share one adapter", async () => {
		const database = createDatabase(
			"postgresql://typelapse:typelapse-local@127.0.0.1:55433/typelapse",
		);

		expect(database.$client.constructor.name).toBe("BoundPool");
		await database.$client.end();
	});
});
