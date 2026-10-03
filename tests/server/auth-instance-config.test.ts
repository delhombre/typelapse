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

	it("rate limits sign-in whatever NODE_ENV says", async () => {
		// Better Auth's own default is "on in production only", and nothing in the
		// hosted start path sets NODE_ENV. The fourth attempt inside the window must
		// be refused before any credential is checked.
		const auth = authInstance(DATABASE, {
			BETTER_AUTH_SECRET: "s".repeat(32),
			BETTER_AUTH_URL: "https://api.typelapse.example",
			CORS_ORIGIN: "https://typelapse.example",
		});
		const attempt = () =>
			auth?.handler(
				new Request("https://api.typelapse.example/api/auth/sign-in/email", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "https://typelapse.example",
						"x-forwarded-for": "203.0.113.7",
					},
					body: JSON.stringify({ email: "qa@example.test", password: "wrong-password" }),
				}),
			);

		const statuses: number[] = [];
		for (let index = 0; index < 4; index += 1) {
			statuses.push((await attempt())?.status ?? 0);
		}

		expect(statuses.slice(0, 3)).not.toContain(429);
		expect(statuses[3]).toBe(429);
	});
});
