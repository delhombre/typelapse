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

function port(overrides: Partial<ClientAuthPort> = {}): ClientAuthPort {
	return {
		sendSignInCode: async () => undefined,
		signInWithCode: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => ACTIVE_SESSION,
		...overrides,
	};
}

const NOW = () => new Date("2026-08-31T11:00:00.000Z");

describe("client account authentication", () => {
	it("asks the provider to mail a code to the address", async () => {
		const sentTo: string[] = [];
		const authentication = createClientAccountAuthentication(
			port({
				sendSignInCode: async (email) => {
					sentTo.push(email);
				},
			}),
			{ now: NOW },
		);

		await authentication.sendCode("ada@example.com");

		expect(sentTo).toEqual(["ada@example.com"]);
	});

	it("establishes sign-in from the authoritative session, not from the code response", async () => {
		const events: string[] = [];
		const authentication = createClientAccountAuthentication(
			port({
				signInWithCode: async (input) => {
					events.push(`code ${input.email} ${input.code}`);
				},
				getSession: async () => {
					events.push("session");
					return ACTIVE_SESSION;
				},
			}),
			{ now: NOW },
		);

		const session = await authentication.signInWithCode({
			email: "ada@example.com",
			code: "042917",
		});

		expect(session).toEqual(ACTIVE_SESSION);
		expect(events).toEqual(["code ada@example.com 042917", "session"]);
	});

	it("never exposes an expired session as authenticated", async () => {
		const authentication = createClientAccountAuthentication(
			port({
				getSession: async () => ({
					...ACTIVE_SESSION,
					expiresAt: new Date("2026-08-31T10:59:59.000Z"),
				}),
			}),
			{ now: NOW },
		);

		expect(
			await authentication.signInWithCode({ email: "ada@example.com", code: "042917" }),
		).toBeNull();
	});

	it("refreshes the current session without replaying a code", async () => {
		const authentication = createClientAccountAuthentication(port(), { now: NOW });

		expect(await authentication.refreshSession()).toEqual(ACTIVE_SESSION);
	});

	it("signs out through the provider boundary", async () => {
		let signedOut = false;
		const authentication = createClientAccountAuthentication(
			port({
				signOut: async () => {
					signedOut = true;
				},
			}),
			{ now: NOW },
		);

		await authentication.signOut();

		expect(signedOut).toBe(true);
	});
});
