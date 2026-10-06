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
		signUpEmail: async () => undefined,
		signInEmail: async () => undefined,
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

		await store.getState().signIn({ email: "ada@example.com", password: "password" });

		expect(store.getState().status.kind).toBe("hosted-unconfigured");
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

	it("signs in and enables sync only from the resulting session", async () => {
		let credentials: { email: string; password: string } | null = null;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInEmail: async (input) => {
						credentials = input;
					},
					getSession: async () => ACTIVE_SESSION,
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);

		await store.getState().signIn({ email: "ada@example.com", password: "password" });

		expect(credentials).toEqual({ email: "ada@example.com", password: "password" });
		expect(store.getState()).toMatchObject({
			status: { kind: "authenticated", session: ACTIVE_SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
	});

	it("signs up and remains unsynchronized when no session was created", async () => {
		let registration: { email: string; name: string; password: string } | null = null;
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signUpEmail: async (input) => {
					registration = input;
				},
			}),
		});

		await store.getState().signUp({
			email: "ada@example.com",
			name: "Ada",
			password: "password",
		});

		expect(registration).toEqual({
			email: "ada@example.com",
			name: "Ada",
			password: "password",
		});
		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: null,
		});
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

	it("keeps sign-in failures safe and unsynchronized", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signInEmail: async () => {
					throw new ClientAuthFailure("invalid-credentials");
				},
			}),
		});

		await store.getState().signIn({ email: "ada@example.com", password: "wrong" });

		expect(store.getState()).toMatchObject({
			status: { kind: "anonymous" },
			operation: "idle",
			canSync: false,
			error: "Email or password is incorrect.",
		});
	});

	it("keeps the account anonymous, and the form usable, when the limiter refuses a request", async () => {
		const store = createAuthStore({
			kind: "hosted",
			port: authPort({
				signUpEmail: async () => {
					throw new ClientAuthFailure("rate-limited", { retryAfterSeconds: 8 });
				},
			}),
		});

		await store.getState().signUp({ name: "Ada", email: "ada@example.com", password: "password" });

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
				signInEmail: async () => {
					throw new ClientAuthFailure("unavailable");
				},
			}),
		});

		await store.getState().signIn({ email: "ada@example.com", password: "password" });

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

	it("lets the latest sign-in win when credential requests finish out of order", async () => {
		const older = deferred<void>();
		const newer = deferred<void>();
		let session = ACTIVE_SESSION;
		let olderSignal: AbortSignal | undefined;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInEmail: async ({ email }, options) => {
						if (email === "ada@example.com") {
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

		const olderSignIn = store.getState().signIn({ email: "ada@example.com", password: "password" });
		const newerSignIn = store
			.getState()
			.signIn({ email: "grace@example.com", password: "password" });
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
		const store = createAuthStore(
			{
				kind: "hosted",
				port: authPort({
					signInEmail: () => signIn.promise,
					getSession: async () => ACTIVE_SESSION,
				}),
			},
			{ now: () => new Date("2026-09-01T11:00:00.000Z") },
		);

		const pendingSignIn = store
			.getState()
			.signIn({ email: "ada@example.com", password: "password" });
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
