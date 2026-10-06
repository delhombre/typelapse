import type {
	ApiKeyRepositoryPort,
	InsertApiKeyResult,
	StoredApiKey,
} from "../../src/application/auth/api-key-repository.port";

/**
 * The second adapter of the key repository, beside the PostgreSQL one. It
 * decides in the same order: the owner's ceiling first, then the prefix.
 */
export class MemoryApiKeyRepository implements ApiKeyRepositoryPort {
	readonly rows = new Map<string, StoredApiKey>();
	readonly uses: Array<{ readonly prefix: string; readonly at: Date }> = [];
	failRecordUse = false;

	async insert(input: {
		readonly key: StoredApiKey;
		readonly maxKeys: number;
	}): Promise<InsertApiKeyResult> {
		const owned = [...this.rows.values()].filter((row) => row.ownerId === input.key.ownerId);
		if (owned.length >= input.maxKeys) {
			return { outcome: "limit-reached" };
		}
		if (this.rows.has(input.key.prefix)) {
			return { outcome: "prefix-taken" };
		}
		this.rows.set(input.key.prefix, input.key);
		return { outcome: "created" };
	}

	async findByPrefix(prefix: string): Promise<StoredApiKey | null> {
		return this.rows.get(prefix) ?? null;
	}

	async listByOwner(ownerId: string): Promise<readonly StoredApiKey[]> {
		return [...this.rows.values()]
			.filter((row) => row.ownerId === ownerId)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async deleteOwned(ownerId: string, prefix: string): Promise<boolean> {
		if (this.rows.get(prefix)?.ownerId !== ownerId) {
			return false;
		}
		return this.rows.delete(prefix);
	}

	async recordUse(prefix: string, at: Date): Promise<void> {
		if (this.failRecordUse) {
			throw new Error("the database is unreachable");
		}
		const row = this.rows.get(prefix);
		// Never backwards, as the PostgreSQL adapter's UPDATE.
		if (row && (row.lastUsedAt === null || row.lastUsedAt.getTime() < at.getTime())) {
			this.rows.set(prefix, { ...row, lastUsedAt: at });
		}
		this.uses.push({ prefix, at });
	}
}
