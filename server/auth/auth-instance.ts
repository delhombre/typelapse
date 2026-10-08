import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { signInCodeMail } from "../../src/application/auth/sign-in-code-mail";
import type { MailPort } from "../../src/domain/ports/mail.port";
import { type CreatorDatabase, databaseFromEnv } from "../db/database";
import * as schema from "../db/schema";
import { smtpMailFromEnv } from "../mail/smtp-mail";
import { createCodeSendLimit } from "./code-send-limit";

type AuthEnvironment = Readonly<Record<string, string | undefined>>;

export interface AuthInstanceOptions {
	/** Test seam: Better Auth's storage. Production uses the Drizzle schema. */
	readonly adapter?: BetterAuthOptions["database"];
}

const CODE_LIFETIME_MINUTES = 10;
const CODE_ATTEMPTS = 3;
const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const SIGN_IN_WITH_CODE_PATH = "/sign-in/email-otp";
/** The plugin's password reset and email change by code: neither exists without passwords. */
const UNUSED_CODE_PATHS = [
	"/email-otp/request-password-reset",
	"/forget-password/email-otp",
	"/email-otp/reset-password",
	"/email-otp/request-email-change",
	"/email-otp/change-email",
];

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
 *
 * Signing in is a six-digit code sent by mail, for a new address and a known one
 * alike (docs/decisions/2026-10-08-passwordless-auth.md). Without mail no code
 * leaves and nobody could finish signing in, so no mail is no auth.
 */
export const authInstance = (
	database: CreatorDatabase | null = databaseFromEnv(),
	environment: AuthEnvironment = process.env,
	mail: MailPort | null = smtpMailFromEnv(environment),
	options: AuthInstanceOptions = {},
) => {
	if (!database || !mail) {
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
	// Ten codes an hour to one mailbox, whoever asks for them.
	const codesPerAddress = createCodeSendLimit({ max: 10, windowMs: 60 * 60 * 1000 });

	return betterAuth({
		database: options.adapter ?? drizzleAdapter(database, { provider: "pg", schema }),
		secret,
		baseURL,
		emailAndPassword: { enabled: false },
		disabledPaths: UNUSED_CODE_PATHS,
		trustedOrigins: [trustedOrigin],
		plugins: [
			emailOTP({
				otpLength: 6,
				expiresIn: CODE_LIFETIME_MINUTES * 60,
				allowedAttempts: CODE_ATTEMPTS,
				// The database keeps a hash: a leaked row opens no account.
				storeOTP: "hashed",
				// Every sign-in send mails, known address or not, so neither the answer nor
				// its timing says whether an account exists. Other types never mail: the
				// endpoint takes its type from the caller.
				async sendVerificationOTP({ email, otp, type }) {
					if (type !== "sign-in") {
						return;
					}
					await mail.send(
						signInCodeMail({ to: email, code: otp, expiresInMinutes: CODE_LIFETIME_MINUTES }),
					);
				},
			}),
		],
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== SEND_CODE_PATH || typeof ctx.body?.email !== "string") {
					return;
				}
				const verdict = codesPerAddress.consume(ctx.body.email);
				if (!verdict.allowed) {
					// Better Auth's own limiter names the wait in X-Retry-After; the island reads it.
					throw new APIError(
						"TOO_MANY_REQUESTS",
						{ message: "Too many requests. Please try again later." },
						{ "X-Retry-After": String(verdict.retryAfterSeconds) },
					);
				}
			}),
		},
		databaseHooks: {
			user: {
				create: {
					// There is no name step: an account is named after its address until it says otherwise.
					async before(user) {
						const name = user.name?.trim() || user.email.split("@")[0] || user.email;
						return { data: { ...user, name } };
					},
				},
			},
		},
		// Better Auth only rate limits when NODE_ENV is "production", and nothing in our
		// start path sets it: `tsx server/index.ts` would serve sign-in with no ceiling at
		// all. Configured auth is hosted auth, so the limit is always on. The client IP
		// comes from `x-forwarded-for`, which the platform proxy must set; the store is in
		// memory, so the ceiling is per instance. Sending a code mails someone, so it is
		// held tighter than Better Auth's three a minute: ten per client per ten minutes,
		// beside the ten an hour per address above. Trying a code is bounded by its three
		// tries; this ceiling only keeps one client from trying codes of many addresses.
		rateLimit: {
			enabled: true,
			customRules: {
				[SEND_CODE_PATH]: { window: 10 * 60, max: 10 },
				[SIGN_IN_WITH_CODE_PATH]: { window: 60, max: 10 },
			},
		},
	});
};

export type AuthInstance = NonNullable<ReturnType<typeof authInstance>>;
