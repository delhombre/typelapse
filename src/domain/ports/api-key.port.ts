/**
 * API keys, as the browser sees them: a person lists, creates and revokes the
 * keys of their own account. Verifying a key is not here: it happens on the
 * server, for the hosted render routes only (`server/auth/api-keys.ts`).
 *
 * Pure domain: no I/O, no framework.
 */

/** What is shown of a key after it is made. The secret is never part of it. */
export interface ApiKeySummary {
	/** `tlk_` and eight characters: public, and what names the key to a person. */
	readonly prefix: string;
	readonly name: string;
	readonly createdAt: Date;
	/** Null for a key that never expires. */
	readonly expiresAt: Date | null;
	/** Null until the key is first used; precise to the minute. */
	readonly lastUsedAt: Date | null;
}

export interface NewApiKey {
	readonly name: string;
	/** Whole days from now; null for a key that never expires. */
	readonly expiresInDays: number | null;
}

/** The one moment the whole key exists in the clear. */
export interface CreatedApiKey {
	readonly created: ApiKeySummary;
	readonly key: string;
}

export type ApiKeyFailureCode = "signed-out" | "key-limit" | "invalid" | "unavailable";

/** A refusal in the server's own sentence, safe to show as written. */
export class ApiKeyFailure extends Error {
	readonly code: ApiKeyFailureCode;

	constructor(code: ApiKeyFailureCode, message: string) {
		super(message);
		this.name = "ApiKeyFailure";
		this.code = code;
	}
}

export interface ApiKeyPort {
	list(): Promise<readonly ApiKeySummary[]>;
	create(input: NewApiKey): Promise<CreatedApiKey>;
	/** Takes effect on the key's next request. */
	revoke(prefix: string): Promise<void>;
}
