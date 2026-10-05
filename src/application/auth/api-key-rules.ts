/**
 * What an API key is, as rules: its shape, how long it lives and what a person
 * may type for one. Pure, so the server, the island and the tests read one
 * source. Randomness and hashing stay on the server (`server/auth/api-keys.ts`):
 * this layer imports nothing from the platform.
 *
 * A key is `tlk_<8 hex>_<64 hex>`. The first two parts are the **prefix**: public,
 * stored in clear, the way a key is named in the island and in a log line. The
 * 64 hex characters are the secret (256 bits), shown once and kept only as a
 * hash. The marker tells a person, and a secret scanner, whose key it is.
 */

/** The most keys an account keeps, so signing up cannot grow this table without bound. */
export const MAX_API_KEYS_PER_ACCOUNT = 10;

export const API_KEY_NAME_MAX = 60;

const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

// No `m` flag: `$` is the end of the input, so a trailing newline is not a key.
const KEY_PATTERN = /^(tlk_[0-9a-f]{8})_([0-9a-f]{64})$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

export interface ParsedApiKey {
	readonly prefix: string;
	readonly secret: string;
}

export function formatApiKey(prefix: string, secret: string): string {
	return `${prefix}_${secret}`;
}

/** The two parts of a well-formed key, or null for anything else. */
export function parseApiKey(value: string): ParsedApiKey | null {
	const match = KEY_PATTERN.exec(value);
	const prefix = match?.[1];
	const secret = match?.[2];
	return prefix && secret ? { prefix, secret } : null;
}

/**
 * A key is good while now is before its expiry. The instant itself is already
 * over, as for a session (`isSessionActive`): "expires at noon" means a request
 * at noon is refused.
 */
export function isApiKeyActive(key: { readonly expiresAt: Date | null }, now: Date): boolean {
	return key.expiresAt === null || key.expiresAt.getTime() > now.getTime();
}

/** When a key made at `made` stops working; null for one that never does. */
export function apiKeyExpiry(made: Date, days: number | null): Date | null {
	return days === null ? null : new Date(made.getTime() + days * DAY_MS);
}

/** The name as it is kept (trimmed), or null when it is blank, too long or not text. */
export function normalizeApiKeyName(input: unknown): string | null {
	if (typeof input !== "string") {
		return null;
	}
	const name = input.trim();
	const length = Array.from(name).length;
	if (length === 0 || length > API_KEY_NAME_MAX || CONTROL_CHARACTER.test(name)) {
		return null;
	}
	return name;
}

/**
 * How many days a new key lives: nothing asked is a key that never expires, and
 * anything but a whole number from one to a year is refused (null).
 */
export function parseExpiresInDays(input: unknown): { readonly days: number | null } | null {
	if (input === undefined || input === null) {
		return { days: null };
	}
	if (
		typeof input !== "number" ||
		!Number.isInteger(input) ||
		input < 1 ||
		input > MAX_EXPIRY_DAYS
	) {
		return null;
	}
	return { days: input };
}
