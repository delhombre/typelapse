/**
 * Authentication: proving who is making a request.
 *
 * Deliberately narrow. Signing up, logging in and rotating credentials are
 * concerns of whichever provider implements this port, not of the domain, so
 * they do not appear here. The domain only ever needs to answer one question:
 * does this credential prove an account, and until when?
 *
 * The credential is an opaque string. The domain must not know whether it is a
 * cookie, a bearer token or something else; that is the adapter's business.
 *
 * Pure domain: no I/O, no framework.
 */

/** The account a session belongs to. Opaque to the domain. */
export type AccountId = string;

/** Proof of authentication, valid until it is not. */
export interface AuthenticatedSession {
	readonly accountId: AccountId;
	readonly expiresAt: Date;
}

export interface AuthPort {
	/**
	 * Resolve an opaque credential into a session.
	 *
	 * Returns null when the credential proves nothing: unknown, tampered with,
	 * or revoked. Implementations must not throw on a bad credential, since an
	 * invalid credential is an expected condition rather than a failure.
	 */
	verify(credential: string): Promise<AuthenticatedSession | null>;
}

/** Whether a session is still valid at a given instant. */
export function isSessionActive(session: AuthenticatedSession, now: Date): boolean {
	return session.expiresAt.getTime() > now.getTime();
}
