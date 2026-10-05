import { ApiKeyFailure } from "@/domain/ports/api-key.port";
import { ApiKeyHttpAdapter } from "@/infrastructure/auth/api-key-http.adapter";
import { describe, expect, it } from "vitest";

const KEY = `tlk_1a2b3c4d_${"0123456789abcdef".repeat(4)}`;
const SUMMARY = {
	prefix: "tlk_1a2b3c4d",
	name: "GitHub Action",
	createdAt: "2026-10-05T12:00:00.000Z",
	expiresAt: "2026-11-04T12:00:00.000Z",
	lastUsedAt: null,
};

interface Call {
	readonly url: string;
	readonly init: RequestInit | undefined;
}

function adapter(respond: (call: Call) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const call = { url: String(input), init };
		calls.push(call);
		return respond(call);
	};
	return { port: new ApiKeyHttpAdapter(fetcher), calls };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

async function failureOf(attempt: Promise<unknown>): Promise<ApiKeyFailure> {
	try {
		await attempt;
	} catch (error) {
		if (error instanceof ApiKeyFailure) {
			return error;
		}
		throw error;
	}
	throw new Error("expected the call to fail");
}

describe("the API key client", () => {
	it("lists the account's keys with dates read as dates", async () => {
		const { port, calls } = adapter(() => json({ keys: [SUMMARY] }));

		const keys = await port.list();

		expect(keys).toEqual([
			{
				prefix: "tlk_1a2b3c4d",
				name: "GitHub Action",
				createdAt: new Date("2026-10-05T12:00:00.000Z"),
				expiresAt: new Date("2026-11-04T12:00:00.000Z"),
				lastUsedAt: null,
			},
		]);
		expect(calls[0]?.url).toBe("/api/keys");
		expect(calls[0]?.init?.credentials).toBe("include");
	});

	it("creates a key from a name and a lifetime and hands back the key and its summary", async () => {
		const { port, calls } = adapter(() => json({ created: SUMMARY, key: KEY }, 201));

		const result = await port.create({ name: "GitHub Action", expiresInDays: 30 });

		expect(result.key).toBe(KEY);
		expect(result.created.prefix).toBe("tlk_1a2b3c4d");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.credentials).toBe("include");
		expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
			name: "GitHub Action",
			expiresInDays: 30,
		});
	});

	it("revokes by prefix, and counts a key that is already gone as revoked", async () => {
		const gone = adapter(() => json({ error: "API key not found" }, 404));
		const there = adapter(() => new Response(null, { status: 204 }));

		await expect(there.port.revoke("tlk_1a2b3c4d")).resolves.toBeUndefined();
		await expect(gone.port.revoke("tlk_1a2b3c4d")).resolves.toBeUndefined();

		expect(there.calls[0]?.url).toBe("/api/keys/tlk_1a2b3c4d");
		expect(there.calls[0]?.init?.method).toBe("DELETE");
		expect(there.calls[0]?.init?.credentials).toBe("include");
	});

	it("carries the server's own sentence for a refusal it can act on", async () => {
		const limit = adapter(() =>
			json(
				{
					error: "You already have 10 API keys, so revoke one to create another",
					code: "key-limit",
					limit: 10,
				},
				409,
			),
		);
		const invalid = adapter(() => json({ error: "Name the key in 1 to 60 characters" }, 400));
		const signedOut = adapter(() => json({ error: "Sign in to manage API keys" }, 401));

		const atLimit = await failureOf(limit.port.create({ name: "x", expiresInDays: null }));
		const bad = await failureOf(invalid.port.create({ name: "", expiresInDays: null }));
		const out = await failureOf(signedOut.port.list());

		expect([atLimit.code, atLimit.message]).toEqual([
			"key-limit",
			"You already have 10 API keys, so revoke one to create another",
		]);
		expect([bad.code, bad.message]).toEqual(["invalid", "Name the key in 1 to 60 characters"]);
		expect([out.code, out.message]).toEqual(["signed-out", "Sign in to manage API keys"]);
	});

	it.each([
		["a server error", () => json({ error: "Request failed" }, 500)],
		["an API that has no keys", () => json({ error: "Not found" }, 404)],
		["a page that is not JSON", () => new Response("<html>bad gateway</html>", { status: 200 })],
		["an answer with no keys in it", () => json({ nothing: true })],
		["a key with no name", () => json({ keys: [{ ...SUMMARY, name: undefined }] })],
		["a date that is not one", () => json({ keys: [{ ...SUMMARY, createdAt: "yesterday" }] })],
	])("says the keys are unavailable for %s", async (_label, respond) => {
		const { port } = adapter(respond);

		const failure = await failureOf(port.list());

		expect(failure.code).toBe("unavailable");
		expect(failure.message).toBe("API keys are not available right now.");
	});

	it("says the keys are unavailable when the network fails, without naming the cause", async () => {
		const { port } = adapter(() => {
			throw new TypeError("Failed to fetch https://internal.example/secret-host");
		});

		const failure = await failureOf(port.create({ name: "ci", expiresInDays: null }));

		expect(failure.code).toBe("unavailable");
		expect(failure.message).not.toContain("internal.example");
	});

	it("does not return a created key that has no key in it", async () => {
		const { port } = adapter(() => json({ created: SUMMARY }, 201));

		const failure = await failureOf(port.create({ name: "ci", expiresInDays: null }));

		expect(failure.code).toBe("unavailable");
	});
});
