import {
	type ClientAccountAuthenticationOptions,
	createClientAccountAuthentication,
} from "@/application/auth/client-account-authentication";
import type { ClientAuthRuntime } from "@/application/auth/client-auth-runtime";
import type {
	ClientSession,
	EmailCredentials,
	SignUpWithEmail,
} from "@/application/auth/client-auth.port";
import { ClientAuthFailure } from "@/application/auth/client-auth.port";
import { clientAuthRuntimeFromEnvironment } from "@/infrastructure/auth/client-auth-runtime";
import { create } from "zustand";

export type ClientAuthStatus =
	| { readonly kind: "local-offline" }
	| { readonly kind: "hosted-unconfigured" }
	| { readonly kind: "hosted-unavailable" }
	| { readonly kind: "checking" }
	| { readonly kind: "anonymous" }
	| { readonly kind: "authenticated"; readonly session: ClientSession };

export type ClientAuthOperation =
	| "idle"
	| "refreshing"
	| "signing-up"
	| "signing-in"
	| "signing-out";

export interface AuthStoreState {
	status: ClientAuthStatus;
	operation: ClientAuthOperation;
	canSync: boolean;
	error: string | null;
	refreshSession(): Promise<void>;
	signUp(input: SignUpWithEmail): Promise<void>;
	signIn(input: EmailCredentials): Promise<void>;
	signOut(): Promise<void>;
}

type SettledAuthState = Pick<AuthStoreState, "status" | "operation" | "canSync" | "error">;

function sessionState(session: ClientSession | null): SettledAuthState {
	return {
		status: session ? { kind: "authenticated", session } : { kind: "anonymous" },
		operation: "idle",
		canSync: session !== null,
		error: null,
	};
}

function failureState(error: unknown): SettledAuthState {
	const failure = error instanceof ClientAuthFailure ? error : new ClientAuthFailure("unexpected");
	if (failure.code === "not-configured") {
		return {
			status: { kind: "hosted-unconfigured" },
			operation: "idle",
			canSync: false,
			error: null,
		};
	}
	const isServiceFailure = failure.code === "unavailable" || failure.code === "unexpected";
	return {
		status: isServiceFailure ? { kind: "hosted-unavailable" } : { kind: "anonymous" },
		operation: "idle",
		canSync: false,
		error: failure.message,
	};
}

function initialStatus(runtime: ClientAuthRuntime): ClientAuthStatus {
	if (runtime.kind === "local-offline") {
		return { kind: "local-offline" };
	}
	if (runtime.kind === "hosted-unconfigured") {
		return { kind: "hosted-unconfigured" };
	}
	return { kind: "checking" };
}

/** Injectable store factory used by tests and alternate client entry points. */
export function createAuthStore(
	runtime: ClientAuthRuntime,
	options: ClientAccountAuthenticationOptions = { now: () => new Date() },
) {
	const authentication =
		runtime.kind === "hosted" ? createClientAccountAuthentication(runtime.port, options) : null;
	let latestRequest = 0;
	let inFlight: AbortController | null = null;
	const beginRequest = () => {
		inFlight?.abort();
		inFlight = new AbortController();
		return { request: ++latestRequest, signal: inFlight.signal };
	};
	const settleLatest = (
		request: number,
		set: (state: Partial<AuthStoreState>) => void,
		state: SettledAuthState,
	) => {
		if (request === latestRequest) {
			inFlight = null;
			set(state);
		}
	};

	return create<AuthStoreState>((set) => ({
		status: initialStatus(runtime),
		operation: "idle",
		canSync: false,
		error: null,
		refreshSession: async () => {
			if (!authentication) {
				return;
			}
			const { request, signal } = beginRequest();
			set({ status: { kind: "checking" }, operation: "refreshing", canSync: false, error: null });
			try {
				const session = await authentication.refreshSession({ signal });
				settleLatest(request, set, sessionState(session));
			} catch (error) {
				settleLatest(request, set, failureState(error));
			}
		},
		signUp: async (input) => {
			if (!authentication) {
				return;
			}
			const { request, signal } = beginRequest();
			set({ status: { kind: "checking" }, operation: "signing-up", canSync: false, error: null });
			try {
				const session = await authentication.signUp(input, { signal });
				settleLatest(request, set, sessionState(session));
			} catch (error) {
				settleLatest(request, set, failureState(error));
			}
		},
		signIn: async (input) => {
			if (!authentication) {
				return;
			}
			const { request, signal } = beginRequest();
			set({ status: { kind: "checking" }, operation: "signing-in", canSync: false, error: null });
			try {
				const session = await authentication.signIn(input, { signal });
				settleLatest(request, set, sessionState(session));
			} catch (error) {
				settleLatest(request, set, failureState(error));
			}
		},
		signOut: async () => {
			if (!authentication) {
				return;
			}
			const { request, signal } = beginRequest();
			set({ status: { kind: "anonymous" }, operation: "signing-out", canSync: false, error: null });
			try {
				await authentication.signOut({ signal });
				settleLatest(request, set, sessionState(null));
			} catch (error) {
				settleLatest(request, set, failureState(error));
			}
		},
	}));
}

/** Default hook. The app shell still needs to call `refreshSession()` on boot. */
export const useAuthStore = createAuthStore(
	clientAuthRuntimeFromEnvironment({
		VITE_TYPELAPSE_DEPLOYMENT_MODE: import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE,
		VITE_TYPELAPSE_AUTH_ENABLED: import.meta.env.VITE_TYPELAPSE_AUTH_ENABLED,
		VITE_BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL,
	}),
);
