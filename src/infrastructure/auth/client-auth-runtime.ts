import type { ClientAuthRuntime } from "../../application/auth/client-auth-runtime";
import type { ClientAuthPort } from "../../application/auth/client-auth.port";
import {
	type BetterAuthClientAdapterOptions,
	createBetterAuthClientPort,
} from "./better-auth-client.adapter";

export interface ClientAuthEnvironment {
	readonly VITE_TYPELAPSE_DEPLOYMENT_MODE?: string;
	readonly VITE_TYPELAPSE_AUTH_ENABLED?: string;
	readonly VITE_BETTER_AUTH_URL?: string;
}

export type ClientAuthPortFactory = (options?: BetterAuthClientAdapterOptions) => ClientAuthPort;

/** Translate public build configuration into an honest account capability. */
export function clientAuthRuntimeFromEnvironment(
	environment: ClientAuthEnvironment,
	createPort: ClientAuthPortFactory = createBetterAuthClientPort,
): ClientAuthRuntime {
	if (environment.VITE_TYPELAPSE_DEPLOYMENT_MODE !== "hosted") {
		return { kind: "local-offline" };
	}
	if (environment.VITE_TYPELAPSE_AUTH_ENABLED === "false") {
		return { kind: "hosted-unconfigured" };
	}

	const configuredURL = environment.VITE_BETTER_AUTH_URL?.trim();
	return {
		kind: "hosted",
		port: createPort(configuredURL ? { baseURL: configuredURL } : undefined),
	};
}
