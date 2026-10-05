import { describe, expect, it } from "vitest";
import {
	API_KEY_NAME_MAX,
	apiKeyExpiry,
	formatApiKey,
	isApiKeyActive,
	normalizeApiKeyName,
	parseApiKey,
	parseExpiresInDays,
} from "../../src/application/auth/api-key-rules";

const SECRET = "0123456789abcdef".repeat(4);
const KEY = `tlk_1a2b3c4d_${SECRET}`;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("the API key format", () => {
	it("reads the prefix and the secret out of a well-formed key", () => {
		expect(parseApiKey(KEY)).toEqual({ prefix: "tlk_1a2b3c4d", secret: SECRET });
	});

	it("writes the same key back from its two parts", () => {
		expect(formatApiKey("tlk_1a2b3c4d", SECRET)).toBe(KEY);
	});

	it.each([
		["empty", ""],
		["another product's prefix", `sk_1a2b3c4d_${SECRET}`],
		["upper-case hex", `tlk_1A2B3C4D_${SECRET}`],
		["a short secret", `tlk_1a2b3c4d_${SECRET.slice(1)}`],
		["a long secret", `tlk_1a2b3c4d_${SECRET}0`],
		["a short prefix id", `tlk_1a2b3c_${SECRET}`],
		["no separator", `tlk_1a2b3c4d${SECRET}`],
		["a leading space", ` ${KEY}`],
		["a trailing newline", `${KEY}\n`],
		["a second key glued on", `${KEY}${KEY}`],
		["only the prefix", "tlk_1a2b3c4d"],
	])("refuses %s", (_label, value) => {
		expect(parseApiKey(value)).toBeNull();
	});
});

describe("when a key is still good", () => {
	const expiresAt = new Date("2026-11-01T00:00:00.000Z");

	it("never lapses without an expiry", () => {
		expect(isApiKeyActive({ expiresAt: null }, new Date("2099-01-01T00:00:00.000Z"))).toBe(true);
	});

	it("is good up to the last millisecond before its expiry and not at it", () => {
		expect(isApiKeyActive({ expiresAt }, new Date(expiresAt.getTime() - 1))).toBe(true);
		expect(isApiKeyActive({ expiresAt }, expiresAt)).toBe(false);
		expect(isApiKeyActive({ expiresAt }, new Date(expiresAt.getTime() + 1))).toBe(false);
	});

	it("counts its life in whole days from the moment it was made", () => {
		const made = new Date("2026-10-05T12:00:00.000Z");

		expect(apiKeyExpiry(made, null)).toBeNull();
		expect(apiKeyExpiry(made, 30)?.getTime()).toBe(made.getTime() + 30 * DAY_MS);
	});
});

describe("what a person may type for a new key", () => {
	it("trims the name and keeps it within sixty characters", () => {
		expect(API_KEY_NAME_MAX).toBe(60);
		expect(normalizeApiKeyName("  GitHub Action  ")).toBe("GitHub Action");
		expect(normalizeApiKeyName("a".repeat(60))).toBe("a".repeat(60));
		expect(normalizeApiKeyName("a".repeat(61))).toBeNull();
	});

	it("refuses a blank or non-text name", () => {
		expect(normalizeApiKeyName("")).toBeNull();
		expect(normalizeApiKeyName("   ")).toBeNull();
		expect(normalizeApiKeyName(undefined)).toBeNull();
		expect(normalizeApiKeyName(42)).toBeNull();
	});

	it("refuses a name that carries a control character", () => {
		expect(normalizeApiKeyName("ci\u0000key")).toBeNull();
		expect(normalizeApiKeyName("ci\nkey")).toBeNull();
	});

	it("reads no expiry as a key that never expires", () => {
		expect(parseExpiresInDays(undefined)).toEqual({ days: null });
		expect(parseExpiresInDays(null)).toEqual({ days: null });
	});

	it("accepts a whole number of days from one to a year", () => {
		expect(parseExpiresInDays(1)).toEqual({ days: 1 });
		expect(parseExpiresInDays(90)).toEqual({ days: 90 });
		expect(parseExpiresInDays(365)).toEqual({ days: 365 });
	});

	it.each([
		["zero", 0],
		["a day over a year", 366],
		["a fraction", 1.5],
		["text", "30"],
		["not a number", Number.NaN],
		["infinity", Number.POSITIVE_INFINITY],
		["a negative", -3],
	])("refuses %s as a number of days", (_label, value) => {
		expect(parseExpiresInDays(value)).toBeNull();
	});
});
