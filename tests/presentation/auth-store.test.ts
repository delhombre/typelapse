import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
import { ClientAuthFailure } from "@/application/auth/client-auth.port";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { describe, expect, it } from "vitest";

const ACTIVE_SESSION: ClientSession = {
	account: { id: "usr_1", email: "ada@example.com", name: "Ada" },
	expiresAt: new Date("2026-09-01T12:00:00.000Z"),
};
const NEWER_SESSION: ClientSession = {
	account: { id: "usr_2", email: "grace@example.com", name: "Grace" },
	expiresAt: new Date("2026-09-01T13:00:00.000Z"),
};

function authPort(overrides: Partial<ClientAuthPort> = {}): ClientAuthPort {
	return {
		sendSignInCode: async () => undefined,
		signInWithCode: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => null,
		...overrides,
	};
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("the client auth store", () => {
	it("represents the local offline product as a normal account-free mode", async () => {
		const store = createAuthStore({ kind: "local-offline" });

		expect(store.getState()).toMatchObject({
			status: { kind: "local-offline" },
			operation: "idle",
			canSync: false,
			error: null,
		});

		await store.getState().refreshSession();

		expect(store.getState()).toMatchObject({
			status: { kind: "local-offline" },
			operation: "idle",
			canSync: false,
			error: null,
		});
	});

	it("reports hosted auth that is not configured as unavailable, not anonymous", async () => {
		const store = createAuthStore({ kind: "hosted-unconfigured" });

		expect(store.getState()).toMatchObject({
			status: { kind: "hosted-unconfigured" },
			operation: "idle",
			canSync: false,
			error: null,
		});

		await store.getState().sendCode("ada@example.com");

		expect(store.getState().status.kind).toBe("hosted-unconfigured");
		expect(store.getState().pendingCode).toBeNull();
	});

	it("enables sync only after refreshing an active hosted session", async () => {
		const store = createAuthStore(
			{ kind: "hosted", port: authPort({ getSession: async () => ACTIVE_SESSION }) },
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);

		expect(store.getState()).toMatchObject({ status: { kind: "checking" }, canSync: false });

		await store.getState().refreshSession();

		expect(store.getState()).toMatchObject({
			status: { kind: "authenticated", session: ACTIVE_SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
	});

	it("settles a hosted deployment with no session as anonymous and unsynchronized", async () => {
		const store = createAuthStore({ kind: "hosted", port: authPort() });

		await store.getState().refreshSession();

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: null,
		});
	});

	it("sends a code, and remembers where and when it went so the code can be typed", async () => {
		const sentTo: string[] = [];
		const sending = deferred<void>();
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					sendSignInCode: async (email) => {
						sentTo.push(email);
						await sending.promise;
					},
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);
		await store.getState().refreshSession();

		const sent = store.getState().sendCode("ada@example.com");
		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "sending-code",
			pendingCode: null,
		});
		sending.resolve();
		await sent;

		expect(sentTo).toEqual(["ada@example.com"]);
		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: null,
			pendingCode: {
				email: "ada@example.com",
				sentAt: new Date("2026-09-01T11:00:00.000Z"),
			},
		});
	});

	it("signs in with the code sent and enables sync only from the resulting session", async () => {
		let tried: { email: string; code: string } | null = null;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInWithCode: async (input) => {
						tried = input;
					},
					getSession: async () => (tried ? ACTIVE_SESSION : null),
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);
		await store.getState().refreshSession();
		await store.getState().sendCode("ada@example.com");

		await store.getState().signInWithCode("042917");

		expect(tried).toEqual({ email: "ada@example.com", code: "042917" });
		expect(store.getState()).toMatchObject({
			status: { kind: "authenticated", session: ACTIVE_SESSION },
			operation: "idle",
			canSync: true,
			error: null,
			pendingCode: null,
		});
	});

	it("tries no code before one was sent", async () => {
		let tried = false;
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signInWithCode: async () => {
					tried = true;
				},
			}),
		});
		await store.getState().refreshSession();

		await store.getState().signInWithCode("042917");

		expect(tried).toBe(false);
		expect(store.getState().status.kind).toBe("anonymous");
	});

	it("keeps the code step when a code is refused, and says why", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signInWithCode: async () => {
					throw new ClientAuthFailure("invalid-code");
				},
			}),
		});
		await store.getState().refreshSession();
		await store.getState().sendCode("ada@example.com");

		await store.getState().signInWithCode("000000");

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: "That code does not match. Check the email and try again.",
			pendingCode: { email: "ada@example.com" },
		});
	});

	it("goes back to the address, forgetting the code step and any refusal", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signInWithCode: async () => {
					throw new ClientAuthFailure("code-expired");
				},
			}),
		});
		await store.getState().refreshSession();
		await store.getState().sendCode("ada@example.com");
		await store.getState().signInWithCode("042917");

		store.getState().forgetCode();

		expect(store.getState()).toMatchObject({ pendingCode: null, error: null });
	});

	it("removes sync authority immediately when signing out", async () => {
		const signOut = deferred<void>();
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					getSession: async () => ACTIVE_SESSION,
					signOut: () => signOut.promise,
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);
		await store.getState().refreshSession();

		const signingOut = store.getState().signOut();

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "signing-out",
			canSync: false,
		});
		signOut.resolve();
		await signingOut;
		expect(store.getState()).toMatchObject({ operation: "idle", canSync: false });
	});

	it("discovers a hosted deployment with no auth endpoint as unconfigured", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				getSession: async () => {
					throw new ClientAuthFailure("not-configured");
				},
			}),
		});

		await store.getState().refreshSession();

		expect(store.getState()).toMatchObject({
			status: { kind: "hosted-unconfigured" },
			operation: "idle",
			canSync: false,
			error: null,
		});
	});

	it("keeps a refused address safe, unsynchronized and on the address step", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				sendSignInCode: async () => {
					throw new ClientAuthFailure("invalid-email");
				},
			}),
		});

		await store.getState().sendCode("ada@");

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: "Enter an email address like ada@example.com.",
			pendingCode: null,
		});
	});

	it("keeps the account anonymous, and the form usable, when the limiter refuses a request", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				sendSignInCode: async () => {
					throw new ClientAuthFailure("rate-limited", { retryAfterSeconds: 8 });
				},
			}),
		});

		await store.getState().sendCode("ada@example.com");

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: "Too many attempts. Try again in 8 seconds.",
		});
	});

	it("still reads a service that is out of reach as unavailable", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				sendSignInCode: async () => {
					throw new ClientAuthFailure("unavailable");
				},
			}),
		});

		await store.getState().sendCode("ada@example.com");

		expect(store.getState()).toMatchObject({
			status: { kind: "hosted-unavailable" },
			operation: "idle",
			canSync: false,
			error: "Account service is temporarily unavailable.",
		});
	});

	it("lets the latest refresh win when an older request resolves last", async () => {
		const older = deferred<ClientSession | null>();
		const newer = deferred<ClientSession | null>();
		const reads = [older, newer];
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					getSession: () => {
						const next = reads.shift();
						if (!next) {
							throw new Error("unexpected session read");
						}
						return next.promise;
					},
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);

		const olderRefresh = store.getState().refreshSession();
		const newerRefresh = store.getState().refreshSession();
		newer.resolve(NEWER_SESSION);
		await newerRefresh;
		older.resolve(null);
		await olderRefresh;

		expect(store.getState()).toMatchObject({
			status: { kind: "authenticated", session: NEWER_SESSION },
			canSync: true,
		});
	});

	it("lets the latest code win when tries finish out of order", async () => {
		const older = deferred<void>();
		const newer = deferred<void>();
		let session: ClientSession | null = null;
		let olderSignal: AbortSignal | undefined;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInWithCode: async ({ code }, options) => {
						if (code === "111111") {
							olderSignal = options?.signal;
							await older.promise;
							session = ACTIVE_SESSION;
							return;
						}
						await newer.promise;
						session = NEWER_SESSION;
					},
					getSession: async () => session,
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);
		await store.getState().refreshSession();
		await store.getState().sendCode("ada@example.com");

		const olderSignIn = store.getState().signInWithCode("111111");
		const newerSignIn = store.getState().signInWithCode("222222");
		expect(olderSignal?.aborted).toBe(true);
		newer.resolve();
		await newerSignIn;
		older.resolve();
		await olderSignIn;

		expect(store.getState()).toMatchObject({
			status: { kind: "authenticated", session: NEWER_SESSION },
			canSync: true,
		});
	});

	it("does not let a pending sign-in restore sync after sign-out", async () => {
		const signIn = deferred<void>();
		let signedIn = false;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInWithCode: () => signIn.promise,
					getSession: async () => (signedIn ? ACTIVE_SESSION : null),
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);
		await store.getState().refreshSession();
		await store.getState().sendCode("ada@example.com");
		signedIn = true;

		const pendingSignIn = store.getState().signInWithCode("042917");
		await store.getState().signOut();
		signIn.resolve();
		await pendingSignIn;

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
		});
	});
});
