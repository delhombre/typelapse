import type { CreatorDatabase } from "../../server/db/database";
import { authInstance } from "../../server/auth/auth-instance";
import { describe, expect, it } from "vitest";

const DATABASE = {} as CreatorDatabase;

describe("authInstance configuration", () => {
	it("keeps local mode backend-free when no database exists", () => {
		expect(authInstance(null, {})).toBeNull();
	});

	it("fails closed when hosted auth configuration is incomplete", () => {
		expect(authInstance(DATABASE, {})).toBeNull();
		expect(
			authInstance(DATABASE, {
				BETTER_AUTH_SECRET: "s".repeat(32),
				BETTER_AUTH_URL: "https://api.typelapse.example",
			}),
		).toBeNull();
	});

	it("rejects weak secrets and non-http origins before constructing auth", () => {
		expect(() =>
			authInstance(DATABASE, {
				BETTER_AUTH_SECRET: "too-short",
				BETTER_AUTH_URL: "https://api.typelapse.example",
				CORS_ORIGIN: "https://typelapse.example",
			}),
		).toThrow("at least 32");
		expect(() =>
			authInstance(DATABASE, {
				BETTER_AUTH_SECRET: "s".repeat(32),
				BETTER_AUTH_URL: "file:///tmp/auth",
				CORS_ORIGIN: "https://typelapse.example",
			}),
		).toThrow("HTTP");
	});

	it("constructs auth only from a complete explicit configuration", () => {
		const auth = authInstance(DATABASE, {
			BETTER_AUTH_SECRET: "s".repeat(32),
			BETTER_AUTH_URL: "https://api.typelapse.example",
			CORS_ORIGIN: "https://typelapse.example",
		});

		expect(auth).not.toBeNull();
	});
});
