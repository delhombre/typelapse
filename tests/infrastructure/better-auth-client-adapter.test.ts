import { ClientAuthFailure } from "@/application/auth/client-auth.port";
import {
	type BetterAuthBrowserClient,
	BetterAuthClientAdapter,
	createBetterAuthClientPort,
} from "@/infrastructure/auth/better-auth-client.adapter";
import { describe, expect, it } from "vitest";

const successful = <T>(data: T) => ({ data, error: null }) as const;
const failed = (status: number, code: string, message: string) =>
	({
		data: null,
		error: { status, statusText: "Request failed", code, message },
	}) as const;

const clientWith = (overrides: Partial<BetterAuthBrowserClient> = {}): BetterAuthBrowserClient => ({
	signUp: { email: async () => successful({}) },
	signIn: { email: async () => successful({}) },
	signOut: async () => successful({ success: true }),
	getSession: async () => successful(null),
	...overrides,
});

describe("the Better Auth browser adapter", () => {
	it("creates the installed Better Auth client with its same-origin default", () => {
		expect(() => createBetterAuthClientPort()).not.toThrow();
	});

	it("maps the provider session without exposing its token", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				getSession: async () =>
					successful({
						session: {
							expiresAt: new Date("2026-09-01T12:00:00.000Z"),
							token: "must-not-leave-the-adapter",
						},
						user: { id: "usr_1", email: "ada@example.com", name: "Ada" },
					}),
			}),
		);

		expect(await adapter.getSession()).toEqual({
			account: { id: "usr_1", email: "ada@example.com", name: "Ada" },
			expiresAt: new Date("2026-09-01T12:00:00.000Z"),
		});
	});

	it("uses Better Auth's email registration action", async () => {
		let received: { email: string; name: string; password: string } | null = null;
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signUp: {
					email: async (input) => {
						received = input;
						return successful({});
					},
				},
			}),
		);

		await adapter.signUpEmail({
			email: "ada@example.com",
			name: "Ada",
			password: "correct horse battery staple",
		});

		expect(received).toEqual({
			email: "ada@example.com",
			name: "Ada",
			password: "correct horse battery staple",
		});
	});

	it("uses Better Auth's email sign-in action", async () => {
		let received: { email: string; password: string } | null = null;
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signIn: {
					email: async (input) => {
						received = input;
						return successful({});
					},
				},
			}),
		);

		await adapter.signInEmail({ email: "ada@example.com", password: "password" });

		expect(received).toEqual({ email: "ada@example.com", password: "password" });
	});

	it("passes cancellation through Better Auth fetch options", async () => {
		const controller = new AbortController();
		let receivedSignal: AbortSignal | null | undefined;
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signIn: {
					email: async (input) => {
						receivedSignal = input.fetchOptions?.signal;
						return successful({});
					},
				},
			}),
		);

		await adapter.signInEmail(
			{ email: "ada@example.com", password: "password" },
			{ signal: controller.signal },
		);

		expect(receivedSignal).toBe(controller.signal);
	});

	it("uses Better Auth's sign-out action", async () => {
		let signedOut = false;
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signOut: async () => {
					signedOut = true;
					return successful({ success: true });
				},
			}),
		);

		await adapter.signOut();

		expect(signedOut).toBe(true);
	});

	it("turns provider failures into safe account errors", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signIn: {
					email: async () =>
						failed(401, "INVALID_EMAIL_OR_PASSWORD", "database password=super-secret"),
				},
			}),
		);

		const failure = await adapter
			.signInEmail({ email: "ada@example.com", password: "wrong" })
			.catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(ClientAuthFailure);
		expect(failure).toMatchObject({
			code: "invalid-credentials",
			message: "Email or password is incorrect.",
		});
		expect(String(failure)).not.toContain("super-secret");
	});

	it("distinguishes an absent hosted auth endpoint from an anonymous session", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				getSession: async () => failed(404, "NOT_FOUND", "route /api/auth missing"),
			}),
		);

		await expect(adapter.getSession()).rejects.toMatchObject({
			code: "not-configured",
			message: "Accounts are not configured for this hosted deployment.",
		});
	});

	it("reports an existing account without reflecting provider details", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signUp: {
					email: async () =>
						failed(
							422,
							"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
							"duplicate key value violates users_email_key",
						),
				},
			}),
		);

		await expect(
			adapter.signUpEmail({ email: "ada@example.com", name: "Ada", password: "password" }),
		).rejects.toMatchObject({
			code: "account-exists",
			message: "An account already uses this email.",
		});
	});

	it("reports provider outages as a safe temporary unavailability", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signOut: async () => failed(503, "DATABASE_DOWN", "postgres://secret@db"),
			}),
		);

		await expect(adapter.signOut()).rejects.toMatchObject({
			code: "unavailable",
			message: "Account service is temporarily unavailable.",
		});
	});

	it("does not leak thrown transport details", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				getSession: async () => {
					throw new Error("fetch https://secret.example?token=private failed");
				},
			}),
		);

		const failure = await adapter.getSession().catch((error: unknown) => error);

		expect(failure).toMatchObject({
			code: "unavailable",
			message: "Account service is temporarily unavailable.",
		});
		expect(String(failure)).not.toContain("secret.example");
	});

	it.each([
		["PASSWORD_TOO_SHORT", "password-rejected"],
		["PASSWORD_TOO_LONG", "password-rejected"],
		["EMAIL_NOT_VERIFIED", "email-not-verified"],
	] as const)("maps %s to the stable %s failure", async (providerCode, expectedCode) => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				signIn: {
					email: async () => failed(400, providerCode, "provider wording may change"),
				},
			}),
		);

		await expect(
			adapter.signInEmail({ email: "ada@example.com", password: "password" }),
		).rejects.toMatchObject({ code: expectedCode });
	});

	it("treats an expired or revoked session as anonymous", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				getSession: async () => failed(401, "SESSION_EXPIRED", "expired"),
			}),
		);

		expect(await adapter.getSession()).toBeNull();
	});

	it("refuses malformed session data instead of claiming authentication", async () => {
		const adapter = new BetterAuthClientAdapter(
			clientWith({
				getSession: async () =>
					successful({
						session: { expiresAt: "not-a-date" },
						user: { id: "usr_1", email: "ada@example.com", name: "Ada" },
					}),
			}),
		);

		await expect(adapter.getSession()).rejects.toMatchObject({ code: "unexpected" });
	});
});
