import { neon } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";

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
export const authInstance = () => {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		return null;
	}

	const db = drizzle(neon(databaseUrl), { schema });

	return betterAuth({
		database: drizzleAdapter(db, { provider: "pg", schema }),
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: process.env.BETTER_AUTH_URL,
		emailAndPassword: { enabled: true },
		trustedOrigins: [process.env.CORS_ORIGIN || "http://localhost:5173"],
	});
};

export type AuthInstance = NonNullable<ReturnType<typeof authInstance>>;
