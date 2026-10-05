/** One key as stored. The secret is not here: only a hash of it is. */
export interface StoredApiKey {
	readonly ownerId: string;
	/** Public and unique; the key's identity everywhere (list, revoke, lookup). */
	readonly prefix: string;
	readonly name: string;
	/** SHA-256 of the secret, lower-case hex. */
	readonly secretHash: string;
	readonly createdAt: Date;
	readonly expiresAt: Date | null;
	readonly lastUsedAt: Date | null;
}

export type InsertApiKeyResult =
	| { readonly outcome: "created" }
	/** The owner already holds `maxKeys`; nothing was written. */
	| { readonly outcome: "limit-reached" }
	/** Another key has this prefix; nothing was written, draw another. */
	| { readonly outcome: "prefix-taken" };

export interface ApiKeyRepositoryPort {
	/** The ceiling is checked and the row written under one owner lock. */
	insert(input: {
		readonly key: StoredApiKey;
		readonly maxKeys: number;
	}): Promise<InsertApiKeyResult>;
	findByPrefix(prefix: string): Promise<StoredApiKey | null>;
	/** Newest first. */
	listByOwner(ownerId: string): Promise<readonly StoredApiKey[]>;
	/** Deleting the row is the revocation; true when this owner had that key. */
	deleteOwned(ownerId: string, prefix: string): Promise<boolean>;
	recordUse(prefix: string, at: Date): Promise<void>;
}
