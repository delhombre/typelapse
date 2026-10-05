import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type {
	ApiKeyRepositoryPort,
	StoredApiKey,
} from "../../src/application/auth/api-key-repository.port";
import { apiKeys } from "./creator-schema";
import type { CreatorDatabase } from "./database";

type ApiKeyRow = typeof apiKeys.$inferSelect;

function storedKeyFromRow(row: ApiKeyRow): StoredApiKey {
	return {
		ownerId: row.ownerId,
		prefix: row.prefix,
		name: row.name,
		secretHash: row.secretHash,
		createdAt: row.createdAt,
		expiresAt: row.expiresAt,
		lastUsedAt: row.lastUsedAt,
	};
}

/** PostgreSQL/Drizzle implementation; ownership is part of every write that names a key. */
export function createApiKeyRepository(db: CreatorDatabase): ApiKeyRepositoryPort {
	return {
		async insert({ key, maxKeys }) {
			// One lock per owner, in a namespace of its own, so a burst of creates
			// serializes: the count it reads is the count it writes against.
			return db.transaction(async (tx) => {
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${`api-keys:${key.ownerId}`}, 0))`,
				);
				const [owned] = await tx
					.select({ count: sql<number>`count(*)::int` })
					.from(apiKeys)
					.where(eq(apiKeys.ownerId, key.ownerId));
				if (Number(owned?.count ?? 0) >= maxKeys) {
					return { outcome: "limit-reached" as const };
				}
				const inserted = await tx
					.insert(apiKeys)
					.values({
						prefix: key.prefix,
						ownerId: key.ownerId,
						name: key.name,
						secretHash: key.secretHash,
						createdAt: key.createdAt,
						expiresAt: key.expiresAt,
						lastUsedAt: key.lastUsedAt,
					})
					.onConflictDoNothing({ target: apiKeys.prefix })
					.returning({ prefix: apiKeys.prefix });
				return inserted.length > 0
					? { outcome: "created" as const }
					: { outcome: "prefix-taken" as const };
			});
		},

		async findByPrefix(prefix) {
			const [row] = await db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix)).limit(1);
			return row ? storedKeyFromRow(row) : null;
		},

		async listByOwner(ownerId) {
			const rows = await db
				.select()
				.from(apiKeys)
				.where(eq(apiKeys.ownerId, ownerId))
				.orderBy(desc(apiKeys.createdAt), desc(apiKeys.prefix));
			return rows.map(storedKeyFromRow);
		},

		async deleteOwned(ownerId, prefix) {
			const deleted = await db
				.delete(apiKeys)
				.where(and(eq(apiKeys.prefix, prefix), eq(apiKeys.ownerId, ownerId)))
				.returning({ prefix: apiKeys.prefix });
			return deleted.length > 0;
		},

		async recordUse(prefix, at) {
			// Never backwards: two instances writing in the same minute keep the later.
			await db
				.update(apiKeys)
				.set({ lastUsedAt: at })
				.where(
					and(
						eq(apiKeys.prefix, prefix),
						or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, at)),
					),
				);
		},
	};
}
