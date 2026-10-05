import {
	ApiKeyFailure,
	type ApiKeyPort,
	type ApiKeySummary,
	type CreatedApiKey,
	type NewApiKey,
} from "@/domain/ports/api-key.port";
import { createApiKeyStore } from "@/presentation/stores/api-key.store";
import { describe, expect, it, vi } from "vitest";

const KEY = `tlk_1a2b3c4d_${"0123456789abcdef".repeat(4)}`;

function summary(prefix: string, name = "GitHub Action"): ApiKeySummary {
	return {
		prefix,
		name,
		createdAt: new Date("2026-10-05T12:00:00.000Z"),
		expiresAt: null,
		lastUsedAt: null,
	};
}

function port(overrides: Partial<ApiKeyPort> = {}): ApiKeyPort {
	return {
		list: async () => [summary("tlk_aaaaaaaa", "first")],
		create: async (input: NewApiKey): Promise<CreatedApiKey> => ({
			created: summary("tlk_1a2b3c4d", input.name),
			key: KEY,
		}),
		revoke: async () => undefined,
		...overrides,
	};
}

/** A call that stays open until the test lets it go. */
function gate<T>() {
	let release: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("the API key store", () => {
	it("loads the keys, and says so while it waits", async () => {
		const pending = gate<readonly ApiKeySummary[]>();
		const store = createApiKeyStore({ port: port({ list: () => pending.promise }) });
		expect(store.getState().status).toBe("idle");

		const loading = store.getState().load();
		expect(store.getState().status).toBe("loading");
		pending.release([summary("tlk_aaaaaaaa")]);
		await loading;

		expect(store.getState().status).toBe("ready");
		expect(store.getState().keys?.map((key) => key.prefix)).toEqual(["tlk_aaaaaaaa"]);
		expect(store.getState().error).toBeNull();
	});

	it("keeps the sentence of a failed load, and tries again on the next one", async () => {
		const list = vi
			.fn<ApiKeyPort["list"]>()
			.mockRejectedValueOnce(
				new ApiKeyFailure("unavailable", "API keys are not available right now."),
			)
			.mockResolvedValueOnce([summary("tlk_aaaaaaaa")]);
		const store = createApiKeyStore({ port: port({ list }) });

		await store.getState().load();
		expect(store.getState().status).toBe("error");
		expect(store.getState().error).toBe("API keys are not available right now.");

		await store.getState().load();
		expect(store.getState().status).toBe("ready");
		expect(store.getState().error).toBeNull();
	});

	it("puts a new key first and holds its secret until it is dismissed", async () => {
		const store = createApiKeyStore({ port: port() });
		await store.getState().load();

		const made = await store.getState().create({ name: "CI", expiresInDays: 30 });

		expect(made).toBe(true);
		expect(store.getState().keys?.map((key) => key.prefix)).toEqual([
			"tlk_1a2b3c4d",
			"tlk_aaaaaaaa",
		]);
		expect(store.getState().created?.key).toBe(KEY);
		expect(store.getState().created?.created.name).toBe("CI");

		store.getState().dismissCreated();

		expect(store.getState().created).toBeNull();
		expect(JSON.stringify(store.getState().keys)).not.toContain(KEY);
	});

	it("refuses a second create while one is in flight", async () => {
		const pending = gate<CreatedApiKey>();
		const create = vi.fn(() => pending.promise);
		const store = createApiKeyStore({ port: port({ create }) });

		const first = store.getState().create({ name: "one", expiresInDays: null });
		expect(store.getState().creating).toBe(true);
		const second = await store.getState().create({ name: "two", expiresInDays: null });
		pending.release({ created: summary("tlk_1a2b3c4d", "one"), key: KEY });
		await first;

		expect(second).toBe(false);
		expect(create).toHaveBeenCalledTimes(1);
		expect(store.getState().creating).toBe(false);
	});

	it("keeps the server's sentence when a key cannot be made, and makes none", async () => {
		const store = createApiKeyStore({
			port: port({
				create: async () => {
					throw new ApiKeyFailure(
						"key-limit",
						"You already have 10 API keys, so revoke one to create another",
					);
				},
			}),
		});

		const made = await store.getState().create({ name: "CI", expiresInDays: null });

		expect(made).toBe(false);
		expect(store.getState().error).toBe(
			"You already have 10 API keys, so revoke one to create another",
		);
		expect(store.getState().created).toBeNull();
		expect(store.getState().creating).toBe(false);
	});

	it("drops a revoked key from the list, and says which one is being revoked", async () => {
		const pending = gate<undefined>();
		const store = createApiKeyStore({
			port: port({
				list: async () => [summary("tlk_aaaaaaaa", "first"), summary("tlk_bbbbbbbb", "second")],
				revoke: () => pending.promise,
			}),
		});
		await store.getState().load();

		const revoking = store.getState().revoke("tlk_aaaaaaaa");
		expect(store.getState().revoking).toBe("tlk_aaaaaaaa");
		pending.release(undefined);
		const revoked = await revoking;

		expect(revoked).toBe(true);
		expect(store.getState().revoking).toBeNull();
		expect(store.getState().keys?.map((key) => key.prefix)).toEqual(["tlk_bbbbbbbb"]);
	});

	it("takes the secret off screen when the key it belongs to is revoked", async () => {
		const store = createApiKeyStore({ port: port() });
		await store.getState().load();
		await store.getState().create({ name: "CI", expiresInDays: null });
		expect(store.getState().created?.key).toBe(KEY);

		await store.getState().revoke("tlk_aaaaaaaa");
		expect(store.getState().created?.key).toBe(KEY);

		await store.getState().revoke("tlk_1a2b3c4d");
		expect(store.getState().created).toBeNull();
	});

	it("keeps a key whose revocation failed, with the reason", async () => {
		const store = createApiKeyStore({
			port: port({
				revoke: async () => {
					throw new ApiKeyFailure("unavailable", "API keys are not available right now.");
				},
			}),
		});
		await store.getState().load();

		const revoked = await store.getState().revoke("tlk_aaaaaaaa");

		expect(revoked).toBe(false);
		expect(store.getState().keys?.map((key) => key.prefix)).toEqual(["tlk_aaaaaaaa"]);
		expect(store.getState().error).toBe("API keys are not available right now.");
		expect(store.getState().revoking).toBeNull();
	});

	it("ignores an answer that arrives after a reset, so a signed-out account keeps nothing", async () => {
		const pending = gate<CreatedApiKey>();
		const store = createApiKeyStore({ port: port({ create: () => pending.promise }) });

		const making = store.getState().create({ name: "CI", expiresInDays: null });
		store.getState().reset();
		pending.release({ created: summary("tlk_1a2b3c4d", "CI"), key: KEY });
		await making;

		expect(store.getState().created).toBeNull();
		expect(store.getState().keys).toBeNull();
		expect(store.getState().creating).toBe(false);
	});

	it("forgets everything, the secret first, on reset", async () => {
		const store = createApiKeyStore({ port: port() });
		await store.getState().load();
		await store.getState().create({ name: "CI", expiresInDays: null });

		store.getState().reset();

		expect(store.getState()).toMatchObject({
			keys: null,
			status: "idle",
			error: null,
			created: null,
			creating: false,
			revoking: null,
		});
	});
});
