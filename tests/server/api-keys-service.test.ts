import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApiKeyService } from "../../server/auth/api-keys";
import { parseApiKey } from "../../src/application/auth/api-key-rules";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function setup(random?: (size: number) => Buffer) {
	const repository = new MemoryApiKeyRepository();
	const service = createApiKeyService({ repository, ...(random ? { random } : {}) });
	return { repository, service };
}

async function makeKey(
	service: ReturnType<typeof setup>["service"],
	overrides: { ownerId?: string; name?: string; expiresInDays?: number | null; now?: Date } = {},
) {
	const result = await service.create({
		ownerId: overrides.ownerId ?? "owner-1",
		name: overrides.name ?? "GitHub Action",
		expiresInDays: overrides.expiresInDays ?? null,
		now: overrides.now ?? NOW,
	});
	if (result.outcome !== "created") {
		throw new Error(`expected a created key, got ${result.outcome}`);
	}
	return result;
}

describe("creating a key", () => {
	it("hands the key back once and keeps only its prefix and the hash of its secret", async () => {
		const { service, repository } = setup();

		const { key, created } = await makeKey(service);

		const parsed = parseApiKey(key);
		expect(parsed).not.toBeNull();
		expect(created.prefix).toBe(parsed?.prefix);
		const [row] = [...repository.rows.values()];
		expect(row?.secretHash).toBe(
			createHash("sha256")
				.update(parsed?.secret ?? "")
				.digest("hex"),
		);
		// Nothing the database holds, or the list shows, carries the secret.
		const stored = JSON.stringify([...repository.rows.values()]);
		expect(stored).not.toContain(parsed?.secret);
		const listed = JSON.stringify(await service.list("owner-1"));
		expect(listed).not.toContain(parsed?.secret);
		expect(listed).not.toContain(row?.secretHash);
	});

	it("gives every key a secret of its own", async () => {
		const { service } = setup();

		const first = await makeKey(service);
		const second = await makeKey(service);

		expect(first.key).not.toBe(second.key);
		expect(parseApiKey(first.key)?.secret).not.toBe(parseApiKey(second.key)?.secret);
	});

	it("lists the key by name, prefix, creation and expiry, newest first", async () => {
		const { service } = setup();
		await makeKey(service, { name: "older", now: new Date(NOW.getTime() - DAY_MS) });
		const newest = await makeKey(service, { name: "newer", expiresInDays: 30 });

		const listed = await service.list("owner-1");

		expect(listed.map((key) => key.name)).toEqual(["newer", "older"]);
		expect(listed[0]).toEqual({
			prefix: newest.created.prefix,
			name: "newer",
			createdAt: NOW,
			expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
			lastUsedAt: null,
		});
		expect(listed[1]?.expiresAt).toBeNull();
	});

	it("lists only the keys of the account that asks", async () => {
		const { service } = setup();
		await makeKey(service, { ownerId: "owner-1" });
		await makeKey(service, { ownerId: "owner-2", name: "someone else's" });

		expect((await service.list("owner-1")).map((key) => key.name)).toEqual(["GitHub Action"]);
	});

	it("keeps ten keys per account and says so at the eleventh", async () => {
		const { service } = setup();
		for (let index = 0; index < 10; index += 1) {
			await makeKey(service, { name: `key ${index}` });
		}

		const eleventh = await service.create({
			ownerId: "owner-1",
			name: "one too many",
			expiresInDays: null,
			now: NOW,
		});
		const another = await makeKey(service, { ownerId: "owner-2" });

		expect(eleventh).toEqual({ outcome: "limit-reached", limit: 10 });
		expect(another.created.name).toBe("GitHub Action");
		expect(await service.list("owner-1")).toHaveLength(10);
	});

	it("draws another prefix when the one it drew is taken", async () => {
		const bytes = [
			// the first key: prefix 01020304, secret of thirty-two 0xaa
			Buffer.from("01020304", "hex"),
			Buffer.alloc(32, 0xaa),
			// the second key's first draw repeats 01020304, then 05060708 is free
			Buffer.from("01020304", "hex"),
			Buffer.alloc(32, 0xbb),
			Buffer.from("05060708", "hex"),
			Buffer.alloc(32, 0xcc),
		];
		const { service } = setup(() => {
			const next = bytes.shift();
			if (!next) {
				throw new Error("the random source ran dry");
			}
			return next;
		});

		const first = await makeKey(service);
		const second = await makeKey(service);

		expect(first.created.prefix).toBe("tlk_01020304");
		expect(second.created.prefix).toBe("tlk_05060708");
	});
});

describe("authenticating a key", () => {
	it("knows the account a key belongs to", async () => {
		const { service } = setup();
		const { key } = await makeKey(service, { ownerId: "owner-7" });

		expect(await service.authenticate(key, NOW)).toEqual({
			outcome: "authenticated",
			accountId: "owner-7",
		});
	});

	it("gives one answer for a key that is unknown, mistyped, revoked or expired", async () => {
		const { service } = setup();
		const live = await makeKey(service);
		const revoked = await makeKey(service, { name: "revoked" });
		const expiring = await makeKey(service, { name: "expiring", expiresInDays: 1 });
		await service.revoke("owner-1", revoked.created.prefix);
		const livePrefix = live.created.prefix;
		const liveSecret = parseApiKey(live.key)?.secret ?? "";
		const wrongSecret = `${livePrefix}_${"f".repeat(64)}`;
		expect(wrongSecret).not.toBe(live.key);
		const tomorrow = new Date(NOW.getTime() + DAY_MS);

		const answers = [
			await service.authenticate(`tlk_00000000_${liveSecret}`, NOW),
			await service.authenticate(wrongSecret, NOW),
			await service.authenticate("not a key", NOW),
			await service.authenticate("", NOW),
			await service.authenticate(revoked.key, NOW),
			await service.authenticate(expiring.key, tomorrow),
		];

		for (const answer of answers) {
			expect(answer).toEqual({ outcome: "refused" });
		}
	});

	it("is good up to the last millisecond before its expiry, by the clock it is given", async () => {
		const { service } = setup();
		const { key } = await makeKey(service, { expiresInDays: 1 });
		const expiresAt = NOW.getTime() + DAY_MS;

		const before = await service.authenticate(key, new Date(expiresAt - 1));
		const at = await service.authenticate(key, new Date(expiresAt));

		expect(before.outcome).toBe("authenticated");
		expect(at).toEqual({ outcome: "refused" });
	});

	it("stops with the revocation, on the very next request", async () => {
		const { service } = setup();
		const { key, created } = await makeKey(service);
		expect((await service.authenticate(key, NOW)).outcome).toBe("authenticated");

		const revoked = await service.revoke("owner-1", created.prefix);

		expect(revoked).toBe(true);
		expect(await service.authenticate(key, NOW)).toEqual({ outcome: "refused" });
		expect(await service.list("owner-1")).toEqual([]);
	});

	it("lets only the owner revoke a key", async () => {
		const { service } = setup();
		const { key, created } = await makeKey(service, { ownerId: "owner-1" });

		const stranger = await service.revoke("owner-2", created.prefix);
		const unknown = await service.revoke("owner-1", "tlk_00000000");

		expect(stranger).toBe(false);
		expect(unknown).toBe(false);
		expect((await service.authenticate(key, NOW)).outcome).toBe("authenticated");
	});
});

describe("last use", () => {
	it("is written on the first use and then at most once a minute", async () => {
		const { service, repository } = setup();
		const { key, created } = await makeKey(service);

		await service.authenticate(key, NOW);
		await service.authenticate(key, new Date(NOW.getTime() + 30_000));
		await service.authenticate(key, new Date(NOW.getTime() + MINUTE_MS - 1));
		await service.authenticate(key, new Date(NOW.getTime() + MINUTE_MS));

		expect(repository.uses).toEqual([
			{ prefix: created.prefix, at: NOW },
			{ prefix: created.prefix, at: new Date(NOW.getTime() + MINUTE_MS) },
		]);
		expect((await service.list("owner-1"))[0]?.lastUsedAt).toEqual(
			new Date(NOW.getTime() + MINUTE_MS),
		);
	});

	it("is not written for a key that was refused", async () => {
		const { service, repository } = setup();
		const { key } = await makeKey(service, { expiresInDays: 1 });

		await service.authenticate(key, new Date(NOW.getTime() + DAY_MS));
		await service.authenticate("tlk_00000000_".concat("0".repeat(64)), NOW);

		expect(repository.uses).toEqual([]);
	});

	it("never fails the request when it cannot be written", async () => {
		const { service, repository } = setup();
		const { key } = await makeKey(service);
		repository.failRecordUse = true;

		expect((await service.authenticate(key, NOW)).outcome).toBe("authenticated");
	});
});

describe("the limit on one key", () => {
	it("answers the 121st request of a minute with how long to wait", async () => {
		const { service } = setup();
		const { key } = await makeKey(service);

		for (let request = 1; request <= 120; request += 1) {
			const answer = await service.authenticate(key, new Date(NOW.getTime() + request * 100));
			expect(answer.outcome).toBe("authenticated");
		}
		const refused = await service.authenticate(key, new Date(NOW.getTime() + 12_100));

		// The window opened at the first request, 100 ms in, so 48 s of it are left.
		expect(refused).toEqual({ outcome: "rate-limited", retryAfterSeconds: 48 });
	});

	it("opens a fresh minute when the last one is over", async () => {
		const { service } = setup();
		const { key } = await makeKey(service);
		for (let request = 0; request < 120; request += 1) {
			await service.authenticate(key, NOW);
		}
		expect((await service.authenticate(key, new Date(NOW.getTime() + MINUTE_MS - 1))).outcome).toBe(
			"rate-limited",
		);

		const next = await service.authenticate(key, new Date(NOW.getTime() + MINUTE_MS));

		expect(next.outcome).toBe("authenticated");
	});

	it("counts each key on its own", async () => {
		const { service } = setup();
		const busy = await makeKey(service, { name: "busy" });
		const quiet = await makeKey(service, { name: "quiet" });
		for (let request = 0; request < 121; request += 1) {
			await service.authenticate(busy.key, NOW);
		}

		expect((await service.authenticate(busy.key, NOW)).outcome).toBe("rate-limited");
		expect((await service.authenticate(quiet.key, NOW)).outcome).toBe("authenticated");
	});

	it("is not spent by a request that did not prove the key", async () => {
		const { service } = setup();
		const { key, created } = await makeKey(service);
		const guess = `${created.prefix}_${"0".repeat(64)}`;
		for (let request = 0; request < 200; request += 1) {
			expect(await service.authenticate(guess, NOW)).toEqual({ outcome: "refused" });
		}

		expect((await service.authenticate(key, NOW)).outcome).toBe("authenticated");
	});
});
