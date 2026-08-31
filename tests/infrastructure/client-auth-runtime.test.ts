import type { ClientAuthPort } from "@/application/auth/client-auth.port";
import { clientAuthRuntimeFromEnvironment } from "@/infrastructure/auth/client-auth-runtime";
import { describe, expect, it } from "vitest";

const port: ClientAuthPort = {
	signUpEmail: async () => undefined,
	signInEmail: async () => undefined,
	signOut: async () => undefined,
	getSession: async () => null,
};

describe("the client auth runtime", () => {
	it("keeps the default and explicit local builds account-free", () => {
		let clientsCreated = 0;
		const createPort = () => {
			clientsCreated += 1;
			return port;
		};

		expect(clientAuthRuntimeFromEnvironment({}, createPort)).toEqual({
			kind: "local-offline",
		});
		expect(
			clientAuthRuntimeFromEnvironment({ VITE_TYPELAPSE_DEPLOYMENT_MODE: "local" }, createPort),
		).toEqual({ kind: "local-offline" });
		expect(clientsCreated).toBe(0);
	});

	it("represents explicitly disabled hosted auth as unconfigured", () => {
		const runtime = clientAuthRuntimeFromEnvironment(
			{
				VITE_TYPELAPSE_DEPLOYMENT_MODE: "hosted",
				VITE_TYPELAPSE_AUTH_ENABLED: "false",
			},
			() => {
				throw new Error("the auth client must not be created");
			},
		);

		expect(runtime).toEqual({ kind: "hosted-unconfigured" });
	});

	it("creates a hosted Better Auth capability with the configured public URL", () => {
		let options: { baseURL?: string } | undefined;
		const runtime = clientAuthRuntimeFromEnvironment(
			{
				VITE_TYPELAPSE_DEPLOYMENT_MODE: "hosted",
				VITE_BETTER_AUTH_URL: " https://studio.example/api/auth ",
			},
			(received) => {
				options = received;
				return port;
			},
		);

		expect(runtime).toEqual({ kind: "hosted", port });
		expect(options).toEqual({ baseURL: "https://studio.example/api/auth" });
	});
});
