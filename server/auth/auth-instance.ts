import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { databaseFromEnv, type CreatorDatabase } from "../db/database";
import * as schema from "../db/schema";

type AuthEnvironment = Readonly<Record<string, string | undefined>>;

function requiredHttpUrl(value: string, label: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be a valid HTTP URL`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`${label} must be a valid HTTP URL`);
	}
	return url.toString().replace(/\/$/, "");
}

/**
 * The auth provider, or nothing at all.
 *
 * Typelapse runs perfectly well with no database: the OSS studio renders on the
 * user's own machine and never needs an account. So a missing DATABASE_URL is a
 * supported configuration, not a misconfiguration, and it must not stop the
 * server from booting. What it does mean is that no session can ever be proven,
 * and therefore that hosted rendering stays closed. That is the correct
 * outcome: hosted rendering runs on our infrastructure and there is none here.
 */
export const authInstance = (
	database: CreatorDatabase | null = databaseFromEnv(),
	environment: AuthEnvironment = process.env,
) => {
	if (!database) {
		return null;
	}
	const secret = environment.BETTER_AUTH_SECRET?.trim();
	const rawBaseUrl = environment.BETTER_AUTH_URL?.trim();
	const rawTrustedOrigin = environment.CORS_ORIGIN?.trim();
	if (!secret || !rawBaseUrl || !rawTrustedOrigin) {
		return null;
	}
	if (secret.length < 32) {
		throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
	}
	const baseURL = requiredHttpUrl(rawBaseUrl, "BETTER_AUTH_URL");
	const trustedOrigin = requiredHttpUrl(rawTrustedOrigin, "CORS_ORIGIN");

	return betterAuth({
		database: drizzleAdapter(database, { provider: "pg", schema }),
		secret,
		baseURL,
		emailAndPassword: { enabled: true },
		trustedOrigins: [trustedOrigin],
		// Better Auth only rate limits when NODE_ENV is "production", and nothing in
		// our start path sets it: `tsx server/index.ts` would serve sign-in with no
		// brute-force ceiling at all. Configured auth is hosted auth, so the limit is
		// always on. The client IP comes from `x-forwarded-for`, which the platform
		// proxy must set; the store is in memory, so the ceiling is per instance.
		rateLimit: { enabled: true },
	});
};

export type AuthInstance = NonNullable<ReturnType<typeof authInstance>>;
