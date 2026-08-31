import type {
	ClientAuthPort,
	ClientAuthRequestOptions,
	ClientSession,
	EmailCredentials,
	SignUpWithEmail,
} from "./client-auth.port";

export interface ClientAccountAuthenticationOptions {
	readonly now: () => Date;
}

export interface ClientAccountAuthentication {
	signUp(input: SignUpWithEmail, options?: ClientAuthRequestOptions): Promise<ClientSession | null>;
	signIn(
		input: EmailCredentials,
		options?: ClientAuthRequestOptions,
	): Promise<ClientSession | null>;
	signOut(options?: ClientAuthRequestOptions): Promise<void>;
	refreshSession(options?: ClientAuthRequestOptions): Promise<ClientSession | null>;
}

/**
 * Account use cases for the browser.
 *
 * A successful credential request is not itself proof of a usable session:
 * only the provider's subsequent session read may enable synchronized work.
 */
export function createClientAccountAuthentication(
	port: ClientAuthPort,
	options: ClientAccountAuthenticationOptions,
): ClientAccountAuthentication {
	const activeSession = async (
		requestOptions?: ClientAuthRequestOptions,
	): Promise<ClientSession | null> => {
		const session = await port.getSession(requestOptions);
		if (!session || session.expiresAt.getTime() <= options.now().getTime()) {
			return null;
		}
		return session;
	};

	return {
		async signUp(input, requestOptions) {
			await port.signUpEmail(input, requestOptions);
			return activeSession(requestOptions);
		},
		async signIn(input, requestOptions) {
			await port.signInEmail(input, requestOptions);
			return activeSession(requestOptions);
		},
		signOut: (requestOptions) => port.signOut(requestOptions),
		refreshSession: activeSession,
	};
}
