import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
	apiKeyExpiry,
	formatApiKey,
	isApiKeyActive,
	MAX_API_KEYS_PER_ACCOUNT,
	parseApiKey,
} from "../../src/application/auth/api-key-rules";
import type {
	ApiKeyRepositoryPort,
	StoredApiKey,
} from "../../src/application/auth/api-key-repository.port";
import type { ApiKeySummary } from "../../src/domain/ports/api-key.port";
import type { AccountId } from "../../src/domain/ports/auth.port";

/**
 * API keys: a second credential, for scripts that have no browser, accepted by
 * the hosted render routes and nowhere else (`requireHostedAccount`). A key is a
 * public prefix and a 256-bit secret; only a SHA-256 hash of the secret is kept.
 * A fast hash is right here: the secret is random, not chosen, so there is
 * nothing to guess and nothing for a slow hash to slow down. It is not peppered
 * with a server secret, so rotating BETTER_AUTH_SECRET leaves every key valid.
 */

const PREFIX_BYTES = 4;
const SECRET_BYTES = 32;
const MAX_PREFIX_DRAWS = 3;

/** "Last used" is precise to the minute: one write a minute per key is enough. */
const USE_RECORD_INTERVAL_MS = 60_000;

/**
 * Requests one key may make in a window, and how long a window is. A render is
 * followed by polling its job; a request a second is generous for that, and a
 * script in a loop meets the ceiling in under a minute. The count is per
 * instance, as Better Auth's sign-in ceiling is.
 */
const RATE_LIMIT_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_PRUNE_AT = 1_000;

export type CreateApiKeyResult =
	| {
			readonly outcome: "created";
			readonly created: ApiKeySummary;
			/** The whole key, here and nowhere else: it cannot be read back. */
			readonly key: string;
	  }
	| { readonly outcome: "limit-reached"; readonly limit: number };

export type ApiKeyAuthentication =
	| { readonly outcome: "authenticated"; readonly accountId: AccountId }
	/** The key is genuine and past its ceiling for now. */
	| { readonly outcome: "rate-limited"; readonly retryAfterSeconds: number }
	/** Unknown, mistyped, revoked or expired: never told apart. */
	| { readonly outcome: "refused" };

export interface ApiKeyService {
	create(input: {
		readonly ownerId: string;
		readonly name: string;
		readonly expiresInDays: number | null;
		readonly now: Date;
	}): Promise<CreateApiKeyResult>;
	list(ownerId: string): Promise<readonly ApiKeySummary[]>;
	/** True when the owner had that key. It stops working with the next request. */
	revoke(ownerId: string, prefix: string): Promise<boolean>;
	/** The only place a key becomes an account; the clock is the caller's. */
	authenticate(credential: string, now: Date): Promise<ApiKeyAuthentication>;
}

/** The part of the service the hosted guard needs. */
export type ApiKeyAuthenticator = Pick<ApiKeyService, "authenticate">;

export interface ApiKeyServiceDependencies {
	readonly repository: ApiKeyRepositoryPort;
	/** The randomness source, replaceable so a test can force a prefix collision. */
	readonly random?: (size: number) => Buffer;
}

const REFUSED = { outcome: "refused" } as const;

/** What an unknown prefix is compared with, so it costs what a wrong secret costs. */
const NO_HASH = Buffer.alloc(32);

const sha256 = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

function summaryOf(key: StoredApiKey): ApiKeySummary {
	return {
		prefix: key.prefix,
		name: key.name,
		createdAt: key.createdAt,
		expiresAt: key.expiresAt,
		lastUsedAt: key.lastUsedAt,
	};
}

/** A fixed window per key, opened by its first request. */
function createFixedWindowLimiter() {
	const windows = new Map<string, { start: number; count: number }>();
	return {
		hit(
			id: string,
			nowMs: number,
		):
			| { readonly allowed: true }
			| { readonly allowed: false; readonly retryAfterSeconds: number } {
			if (windows.size >= RATE_LIMIT_PRUNE_AT) {
				for (const [key, open] of windows) {
					if (open.start + RATE_LIMIT_WINDOW_MS <= nowMs) {
						windows.delete(key);
					}
				}
			}
			const current = windows.get(id);
			if (!current || current.start + RATE_LIMIT_WINDOW_MS <= nowMs) {
				windows.set(id, { start: nowMs, count: 1 });
				return { allowed: true };
			}
			if (current.count >= RATE_LIMIT_REQUESTS) {
				const left = current.start + RATE_LIMIT_WINDOW_MS - nowMs;
				return { allowed: false, retryAfterSeconds: Math.ceil(left / 1000) };
			}
			current.count += 1;
			return { allowed: true };
		},
	};
}

export function createApiKeyService({
	repository,
	random = randomBytes,
}: ApiKeyServiceDependencies): ApiKeyService {
	const limiter = createFixedWindowLimiter();

	return {
		async create({ ownerId, name, expiresInDays, now }) {
			for (let draw = 0; draw < MAX_PREFIX_DRAWS; draw += 1) {
				const prefix = `tlk_${random(PREFIX_BYTES).toString("hex")}`;
				const secret = random(SECRET_BYTES).toString("hex");
				const stored: StoredApiKey = {
					ownerId,
					prefix,
					name,
					secretHash: sha256(secret).toString("hex"),
					createdAt: now,
					expiresAt: apiKeyExpiry(now, expiresInDays),
					lastUsedAt: null,
				};
				const result = await repository.insert({
					key: stored,
					maxKeys: MAX_API_KEYS_PER_ACCOUNT,
				});
				if (result.outcome === "limit-reached") {
					return { outcome: "limit-reached", limit: MAX_API_KEYS_PER_ACCOUNT };
				}
				if (result.outcome === "created") {
					return {
						outcome: "created",
						created: summaryOf(stored),
						key: formatApiKey(prefix, secret),
					};
				}
			}
			// 32 bits of prefix, taken three times running: not chance, so do not loop on.
			throw new Error("No free API key prefix could be drawn");
		},

		async list(ownerId) {
			return (await repository.listByOwner(ownerId)).map(summaryOf);
		},

		revoke: (ownerId, prefix) => repository.deleteOwned(ownerId, prefix),

		async authenticate(credential, now) {
			const parsed = parseApiKey(credential);
			if (!parsed) {
				return REFUSED;
			}
			const stored = await repository.findByPrefix(parsed.prefix);
			// The secret is checked through its hash, in constant time, and an unknown
			// prefix is checked too, against nothing: both refusals do the same work.
			const kept = stored ? Buffer.from(stored.secretHash, "hex") : NO_HASH;
			const presented = sha256(parsed.secret);
			const proven = timingSafeEqual(presented, kept.length === presented.length ? kept : NO_HASH);
			if (!stored || !proven || !isApiKeyActive(stored, now)) {
				return REFUSED;
			}
			const turn = limiter.hit(stored.prefix, now.getTime());
			if (!turn.allowed) {
				return { outcome: "rate-limited", retryAfterSeconds: turn.retryAfterSeconds };
			}
			if (
				stored.lastUsedAt === null ||
				now.getTime() - stored.lastUsedAt.getTime() >= USE_RECORD_INTERVAL_MS
			) {
				// A key that works must not stop working because a timestamp did not save.
				await repository.recordUse(stored.prefix, now).catch(() => undefined);
			}
			return { outcome: "authenticated", accountId: stored.ownerId };
		},
	};
}
