import { createAuthClient } from "better-auth/client";
import type {
	ClientAuthPort,
	ClientAuthRequestOptions,
	ClientSession,
	EmailCredentials,
	SignUpWithEmail,
} from "../../application/auth/client-auth.port";
import { ClientAuthFailure } from "../../application/auth/client-auth.port";

export interface BetterAuthErrorResponse {
	readonly status: number;
	readonly statusText: string;
	readonly code?: string;
	readonly message?: string;
}

export type BetterAuthResponse<T> =
	| { readonly data: T; readonly error: null }
	| { readonly data: null; readonly error: BetterAuthErrorResponse };

interface BetterAuthProviderSession {
	readonly session: {
		readonly expiresAt: Date | string;
		readonly token?: string;
	};
	readonly user: {
		readonly id: string;
		readonly email: string;
		readonly name: string;
	};
}

interface BetterAuthFetchOptions {
	readonly fetchOptions?: {
		readonly signal?: AbortSignal;
		/** Better Fetch awaits this with the raw response before it hands back the error. */
		readonly onError?: (context: { readonly response: Response }) => void;
	};
}

/** Structural slice of `createAuthClient()` kept injectable for adapter tests. */
export interface BetterAuthBrowserClient {
	readonly signUp: {
		email(input: SignUpWithEmail & BetterAuthFetchOptions): Promise<BetterAuthResponse<unknown>>;
	};
	readonly signIn: {
		email(input: EmailCredentials & BetterAuthFetchOptions): Promise<BetterAuthResponse<unknown>>;
	};
	signOut(input?: BetterAuthFetchOptions): Promise<BetterAuthResponse<unknown>>;
	getSession(
		input?: BetterAuthFetchOptions,
	): Promise<BetterAuthResponse<BetterAuthProviderSession | null>>;
}

/**
 * The seconds a refusal asks the caller to wait. `Retry-After` is the standard
 * header and Better Auth's limiter sends `X-Retry-After`. Only a whole number of
 * seconds counts: an HTTP date, zero or anything else reads as "not said".
 */
function waitFromHeaders(headers: Headers): number | null {
	for (const name of ["retry-after", "x-retry-after"]) {
		const value = headers.get(name)?.trim() ?? "";
		const seconds = Number(value);
		if (/^\d+$/.test(value) && seconds > 0 && Number.isSafeInteger(seconds)) {
			return seconds;
		}
	}
	return null;
}

/**
 * The options of one provider call. Better Auth's error object carries a status
 * and a body but not the response headers, so the wait a limiter asks for is
 * caught from the raw response as it passes through `onError`.
 */
function providerCall(options?: ClientAuthRequestOptions) {
	let retryAfterSeconds: number | null = null;
	return {
		fetchOptions: {
			...(options?.signal ? { signal: options.signal } : {}),
			onError: ({ response }: { readonly response: Response }) => {
				retryAfterSeconds = waitFromHeaders(response.headers);
			},
		},
		get retryAfterSeconds() {
			return retryAfterSeconds;
		},
	};
}

function providerFailure(
	error: BetterAuthErrorResponse,
	retryAfterSeconds: number | null,
): ClientAuthFailure {
	if (error.status === 404) {
		return new ClientAuthFailure("not-configured");
	}
	if (error.status === 429) {
		return new ClientAuthFailure("rate-limited", { retryAfterSeconds });
	}
	if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
		return new ClientAuthFailure("invalid-credentials");
	}
	if (
		error.code === "USER_ALREADY_EXISTS" ||
		error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
	) {
		return new ClientAuthFailure("account-exists");
	}
	if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
		return new ClientAuthFailure("password-rejected");
	}
	if (error.code === "EMAIL_NOT_VERIFIED") {
		return new ClientAuthFailure("email-not-verified");
	}
	if (error.status >= 500) {
		return new ClientAuthFailure("unavailable");
	}
	return new ClientAuthFailure("unexpected");
}

async function providerRequest<T>(
	request: () => Promise<BetterAuthResponse<T>>,
): Promise<BetterAuthResponse<T>> {
	try {
		return await request();
	} catch {
		throw new ClientAuthFailure("unavailable");
	}
}

export class BetterAuthClientAdapter implements ClientAuthPort {
	constructor(private readonly client: BetterAuthBrowserClient) {}

	async signUpEmail(input: SignUpWithEmail, options?: ClientAuthRequestOptions): Promise<void> {
		const call = providerCall(options);
		const response = await providerRequest(() =>
			this.client.signUp.email({ ...input, fetchOptions: call.fetchOptions }),
		);
		if (response.error) {
			throw providerFailure(response.error, call.retryAfterSeconds);
		}
	}

	async signInEmail(input: EmailCredentials, options?: ClientAuthRequestOptions): Promise<void> {
		const call = providerCall(options);
		const response = await providerRequest(() =>
			this.client.signIn.email({ ...input, fetchOptions: call.fetchOptions }),
		);
		if (response.error) {
			throw providerFailure(response.error, call.retryAfterSeconds);
		}
	}

	async signOut(options?: ClientAuthRequestOptions): Promise<void> {
		const call = providerCall(options);
		const response = await providerRequest(() =>
			this.client.signOut({ fetchOptions: call.fetchOptions }),
		);
		if (response.error) {
			throw providerFailure(response.error, call.retryAfterSeconds);
		}
	}

	async getSession(options?: ClientAuthRequestOptions): Promise<ClientSession | null> {
		const call = providerCall(options);
		const response = await providerRequest(() =>
			this.client.getSession({ fetchOptions: call.fetchOptions }),
		);
		if (response.error) {
			if (response.error.status === 401) {
				return null;
			}
			throw providerFailure(response.error, call.retryAfterSeconds);
		}
		if (!response.data) {
			return null;
		}
		const expiresAt =
			response.data.session.expiresAt instanceof Date
				? response.data.session.expiresAt
				: new Date(response.data.session.expiresAt);
		if (Number.isNaN(expiresAt.getTime())) {
			throw new ClientAuthFailure("unexpected");
		}

		return {
			account: {
				id: response.data.user.id,
				email: response.data.user.email,
				name: response.data.user.name,
			},
			expiresAt,
		};
	}
}

export interface BetterAuthClientAdapterOptions {
	/** Absolute Better Auth endpoint for a cross-origin deployment. Omit for same-origin `/api/auth`. */
	readonly baseURL?: string;
}

/** Production client backed by Better Auth 1.6's browser API. */
export function createBetterAuthClientPort(
	options: BetterAuthClientAdapterOptions = {},
): ClientAuthPort {
	const client = options.baseURL
		? createAuthClient({ baseURL: options.baseURL })
		: createAuthClient();
	return new BetterAuthClientAdapter(client);
}
