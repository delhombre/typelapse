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

/**
 * Better Fetch's error object carries a status and a body, not the headers: it
 * hands the raw response to `onError` first and returns the error after.
 */
const refusedWith =
	(status: number, headers: Record<string, string> = {}) =>
	async (input?: {
		fetchOptions?: { onError?: (context: { response: Response }) => void | Promise<void> };
	}) => {
		await input?.fetchOptions?.onError?.({ response: new Response(null, { status, headers }) });
		return {
			data: null,
			error: { status, statusText: "Too Many Requests", message: "Too many requests." },
		} as const;
	};

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

		// The one thing the adapter adds is the hook that reads a limiter's wait.
		expect(received).toEqual({
			email: "ada@example.com",
			name: "Ada",
			password: "correct horse battery staple",
			fetchOptions: { onError: expect.any(Function) },
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

		expect(received).toEqual({
			email: "ada@example.com",
			password: "password",
			fetchOptions: { onError: expect.any(Function) },
		});
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

	describe("when the provider's rate limiter answers 429", () => {
		const limitedWith = (headers?: Record<string, string>) =>
			new BetterAuthClientAdapter(
				clientWith({
					signUp: { email: refusedWith(429, headers) },
					signIn: { email: refusedWith(429, headers) },
					signOut: refusedWith(429, headers),
					getSession: refusedWith(429, headers),
				}),
			);

		it.each([
			[
				"a sign-up",
				(adapter: BetterAuthClientAdapter) =>
					adapter.signUpEmail({ email: "ada@example.com", name: "Ada", password: "password" }),
			],
			[
				"a sign-in",
				(adapter: BetterAuthClientAdapter) =>
					adapter.signInEmail({ email: "ada@example.com", password: "password" }),
			],
			["a sign-out", (adapter: BetterAuthClientAdapter) => adapter.signOut()],
			["a session read", (adapter: BetterAuthClientAdapter) => adapter.getSession()],
		])("refuses %s as rate limited, not as an outage", async (_call, attempt) => {
			await expect(attempt(limitedWith({ "x-retry-after": "8" }))).rejects.toMatchObject({
				code: "rate-limited",
				retryAfterSeconds: 8,
				message: "Too many attempts. Try again in 8 seconds.",
			});
		});

		it.each([
			["Better Auth's X-Retry-After", { "x-retry-after": "9" }, 9, "9 seconds"],
			["the standard Retry-After", { "retry-after": "30" }, 30, "30 seconds"],
			[
				"the standard header over the other",
				{ "retry-after": "5", "x-retry-after": "9" },
				5,
				"5 seconds",
			],
			["a single second", { "x-retry-after": "1" }, 1, "1 second"],
			["a whole minute", { "x-retry-after": "60" }, 60, "1 minute"],
			["minutes, rounded up", { "x-retry-after": "125" }, 125, "3 minutes"],
		])("reads the wait from %s", async (_name, headers, seconds, phrase) => {
			await expect(
				limitedWith(headers).signInEmail({ email: "a@b.co", password: "x" }),
			).rejects.toMatchObject({
				code: "rate-limited",
				retryAfterSeconds: seconds,
				message: `Too many attempts. Try again in ${phrase}.`,
			});
		});

		it.each([
			["no header", {}],
			["a date instead of seconds", { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }],
			["zero", { "x-retry-after": "0" }],
			["a negative number", { "x-retry-after": "-3" }],
			["words", { "x-retry-after": "soon" }],
		])("says to try again in a moment when it gets %s", async (_name, headers) => {
			await expect(
				limitedWith(headers).signInEmail({ email: "a@b.co", password: "x" }),
			).rejects.toMatchObject({
				code: "rate-limited",
				retryAfterSeconds: null,
				message: "Too many attempts. Try again in a moment.",
			});
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
