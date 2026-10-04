import { type AccountId, type AuthPort, isSessionActive } from "../../domain/ports/auth.port";

export interface AuthenticateAccountRequest {
	readonly credential: string | null;
	readonly auth: AuthPort;
	readonly now: Date;
}

/** Resolve an active account session without granting any product entitlement. */
export async function authenticateAccount({
	credential,
	auth,
	now,
}: AuthenticateAccountRequest): Promise<AccountId | null> {
	if (!credential) {
		return null;
	}
	const session = await auth.verify(credential);
	if (!session || !isSessionActive(session, now)) {
		return null;
	}
	return session.accountId;
}
