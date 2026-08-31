import type { ClientAuthPort } from "./client-auth.port";

/** Account capability supplied by the deployment, independently of UI state. */
export type ClientAuthRuntime =
	| { readonly kind: "local-offline" }
	| { readonly kind: "hosted-unconfigured" }
	| { readonly kind: "hosted"; readonly port: ClientAuthPort };
