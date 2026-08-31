export interface EmailCredentials {
	readonly email: string;
	readonly password: string;
}

export interface SignUpWithEmail extends EmailCredentials {
	readonly name: string;
}

export interface ClientAccount {
	readonly id: string;
	readonly email: string;
	readonly name: string;
}

/** Browser-safe session data. Provider tokens deliberately never cross this port. */
export interface ClientSession {
	readonly account: ClientAccount;
	readonly expiresAt: Date;
}

export interface ClientAuthRequestOptions {
	readonly signal?: AbortSignal;
}

/** The provider operations needed by the client-side account use cases. */
export interface ClientAuthPort {
	signUpEmail(input: SignUpWithEmail, options?: ClientAuthRequestOptions): Promise<void>;
	signInEmail(input: EmailCredentials, options?: ClientAuthRequestOptions): Promise<void>;
	signOut(options?: ClientAuthRequestOptions): Promise<void>;
	getSession(options?: ClientAuthRequestOptions): Promise<ClientSession | null>;
}

export type ClientAuthFailureCode =
	| "invalid-credentials"
	| "account-exists"
	| "password-rejected"
	| "email-not-verified"
	| "not-configured"
	| "unavailable"
	| "unexpected";

const SAFE_AUTH_MESSAGES: Record<ClientAuthFailureCode, string> = {
	"invalid-credentials": "Email or password is incorrect.",
	"account-exists": "An account already uses this email.",
	"password-rejected": "Choose a password that meets the account requirements.",
	"email-not-verified": "Verify your email before signing in.",
	"not-configured": "Accounts are not configured for this hosted deployment.",
	unavailable: "Account service is temporarily unavailable.",
	unexpected: "Account request could not be completed.",
};

/** A deliberately provider-agnostic, safe-to-render account failure. */
export class ClientAuthFailure extends Error {
	readonly code: ClientAuthFailureCode;

	constructor(code: ClientAuthFailureCode) {
		super(SAFE_AUTH_MESSAGES[code]);
		this.name = "ClientAuthFailure";
		this.code = code;
	}
}
