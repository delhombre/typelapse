// Relative rather than aliased: imported by the Hono server, which runs under
// tsx and does not resolve the "@/" path mapping at runtime.
import type { AuthPort, AuthenticatedSession } from "../../domain/ports/auth.port";

/**
 * The slice of better-auth this adapter actually uses.
 *
 * Described structurally rather than imported, so the adapter can be tested
 * against a double without a database, and so a better-auth upgrade that moves
 * unrelated APIs cannot break this file.
 */
export interface SessionReader {
	readonly api: {
		getSession(args: { headers: Headers }): Promise<{
			session: { userId: string; expiresAt: Date | string };
		} | null>;
	};
}

const asDate = (value: Date | string): Date => {
	return value instanceof Date ? value : new Date(value);
};

/**
 * Adapt better-auth to {@link AuthPort}.
 *
 * The credential is the raw cookie header. better-auth owns the cookie name and
 * its signature, so the domain never learns either.
 */
export const betterAuthAdapter = (auth: SessionReader): AuthPort => ({
	async verify(credential: string): Promise<AuthenticatedSession | null> {
		const headers = new Headers({ cookie: credential });

		// A malformed or revoked credential is an expected condition, not a
		// failure: the port contract says return null rather than throw.
		const result = await auth.api.getSession({ headers }).catch(() => null);

		if (result === null) {
			return null;
		}

		return {
			accountId: result.session.userId,
			expiresAt: asDate(result.session.expiresAt),
		};
	},
});
