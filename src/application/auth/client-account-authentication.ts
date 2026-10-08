import type {
	ClientAuthPort,
	ClientAuthRequestOptions,
	ClientSession,
	SignInCode,
} from "./client-auth.port";

export interface ClientAccountAuthenticationOptions {
	readonly now: () => Date;
}

export interface ClientAccountAuthentication {
	sendCode(email: string, options?: ClientAuthRequestOptions): Promise<void>;
	signInWithCode(
		input: SignInCode,
		options?: ClientAuthRequestOptions,
	): Promise<ClientSession | null>;
	signOut(options?: ClientAuthRequestOptions): Promise<void>;
	refreshSession(options?: ClientAuthRequestOptions): Promise<ClientSession | null>;
}

/**
 * Account use cases for the browser.
 *
 * A code that was accepted is not itself proof of a usable session:
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
		sendCode: (email, requestOptions) => port.sendSignInCode(email, requestOptions),
		async signInWithCode(input, requestOptions) {
			await port.signInWithCode(input, requestOptions);
			return activeSession(requestOptions);
		},
		signOut: (requestOptions) => port.signOut(requestOptions),
		refreshSession: activeSession,
	};
}
