import { createClientAccountAuthentication } from "@/application/auth/client-account-authentication";
import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
import { describe, expect, it } from "vitest";

const ACTIVE_SESSION: ClientSession = {
	account: {
		id: "usr_1",
		email: "ada@example.com",
		name: "Ada",
	},
	expiresAt: new Date("2026-08-31T12:00:00.000Z"),
};

describe("client account authentication", () => {
	it("establishes sign-in from the authoritative session, not from the credential response", async () => {
		const events: string[] = [];
		const port: ClientAuthPort = {
			signUpEmail: async () => undefined,
			signInEmail: async () => {
				events.push("sign-in");
			},
			signOut: async () => undefined,
			getSession: async () => {
				events.push("session");
				return ACTIVE_SESSION;
			},
		};
		const authentication = createClientAccountAuthentication(port, {
			now: () => new Date("2026-08-31T11:00:00.000Z"),
		});

		const session = await authentication.signIn({
			email: "ada@example.com",
			password: "correct horse battery staple",
		});

		expect(session).toEqual(ACTIVE_SESSION);
		expect(events).toEqual(["sign-in", "session"]);
	});

	it("never exposes an expired session as authenticated", async () => {
		const port: ClientAuthPort = {
			signUpEmail: async () => undefined,
			signInEmail: async () => undefined,
			signOut: async () => undefined,
			getSession: async () => ({
				...ACTIVE_SESSION,
				expiresAt: new Date("2026-08-31T10:59:59.000Z"),
			}),
		};
		const authentication = createClientAccountAuthentication(port, {
			now: () => new Date("2026-08-31T11:00:00.000Z"),
		});

		expect(
			await authentication.signIn({ email: "ada@example.com", password: "password" }),
		).toBeNull();
	});

	it("registers by email and only returns the session created by the provider", async () => {
		let registered: { email: string; name: string; password: string } | null = null;
		const port: ClientAuthPort = {
			signUpEmail: async (input) => {
				registered = input;
			},
			signInEmail: async () => undefined,
			signOut: async () => undefined,
			getSession: async () => ACTIVE_SESSION,
		};
		const authentication = createClientAccountAuthentication(port, {
			now: () => new Date("2026-08-31T11:00:00.000Z"),
		});

		const session = await authentication.signUp({
			email: "ada@example.com",
			name: "Ada",
			password: "correct horse battery staple",
		});

		expect(registered).toEqual({
			email: "ada@example.com",
			name: "Ada",
			password: "correct horse battery staple",
		});
		expect(session).toEqual(ACTIVE_SESSION);
	});

	it("refreshes the current session without replaying credentials", async () => {
		const port: ClientAuthPort = {
			signUpEmail: async () => undefined,
			signInEmail: async () => undefined,
			signOut: async () => undefined,
			getSession: async () => ACTIVE_SESSION,
		};
		const authentication = createClientAccountAuthentication(port, {
			now: () => new Date("2026-08-31T11:00:00.000Z"),
		});

		expect(await authentication.refreshSession()).toEqual(ACTIVE_SESSION);
	});

	it("signs out through the provider boundary", async () => {
		let signedOut = false;
		const port: ClientAuthPort = {
			signUpEmail: async () => undefined,
			signInEmail: async () => undefined,
			signOut: async () => {
				signedOut = true;
			},
			getSession: async () => ACTIVE_SESSION,
		};
		const authentication = createClientAccountAuthentication(port, {
			now: () => new Date("2026-08-31T11:00:00.000Z"),
		});

		await authentication.signOut();

		expect(signedOut).toBe(true);
	});
});
