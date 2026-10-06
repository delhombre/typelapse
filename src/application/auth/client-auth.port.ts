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
	| "rate-limited"
	| "not-configured"
	| "unavailable"
	| "unexpected";

/** The wait as a person counts it: seconds under a minute, else whole minutes rounded up. */
function waitPhrase(seconds: number): string {
	if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** What the person reads when the provider's limiter refuses a request, and how long it asked for. */
function rateLimitedMessage(retryAfterSeconds: number | null): string {
	const wait = retryAfterSeconds === null ? "a moment" : waitPhrase(retryAfterSeconds);
	return `Too many attempts. Try again in ${wait}.`;
}

const SAFE_AUTH_MESSAGES: Record<ClientAuthFailureCode, string> = {
	"invalid-credentials": "Email or password is incorrect.",
	"account-exists": "An account already uses this email.",
	"password-rejected": "Choose a password that meets the account requirements.",
	"email-not-verified": "Verify your email before signing in.",
	"rate-limited": rateLimitedMessage(null),
	"not-configured": "Accounts are not configured for this hosted deployment.",
	unavailable: "Account service is temporarily unavailable.",
	unexpected: "Account request could not be completed.",
};

/** A deliberately provider-agnostic, safe-to-render account failure. */
export class ClientAuthFailure extends Error {
	readonly code: ClientAuthFailureCode;
	/** Whole seconds a `rate-limited` refusal asked the caller to wait; null when it did not say. */
	readonly retryAfterSeconds: number | null;

	constructor(
		code: ClientAuthFailureCode,
		options: { readonly retryAfterSeconds?: number | null } = {},
	) {
		const wait = code === "rate-limited" ? (options.retryAfterSeconds ?? null) : null;
		super(wait === null ? SAFE_AUTH_MESSAGES[code] : rateLimitedMessage(wait));
		this.name = "ClientAuthFailure";
		this.code = code;
		this.retryAfterSeconds = wait;
	}
}
