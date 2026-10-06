import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKeyRepository } from "../../server/db/api-key.repository";
import { createDatabase } from "../../server/db/database";
import { user } from "../../server/db/schema";
import type {
	ApiKeyRepositoryPort,
	StoredApiKey,
} from "../../src/application/auth/api-key-repository.port";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

/**
 * One contract, two adapters. The memory adapter always runs. The PostgreSQL one
 * runs when TYPELAPSE_TEST_DATABASE_URL names a database, for example the one
 * `tests/e2e/hosted/services.sh up` starts:
 *
 *   TYPELAPSE_TEST_DATABASE_URL=postgres://postgres:typelapse@127.0.0.1:54381/typelapse
 *
 * It applies the migrations, makes its own accounts and removes them, which
 * takes their keys with them.
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;
const T0 = new Date("2026-10-05T12:00:00.000Z");

interface Subject {
	readonly repository: ApiKeyRepositoryPort;
	account(label: string): Promise<string>;
	dispose(): Promise<void>;
}

async function memorySubject(): Promise<Subject> {
	return {
		repository: new MemoryApiKeyRepository(),
		account: async (label) => `${label}-${randomBytes(3).toString("hex")}`,
		dispose: async () => undefined,
	};
}

async function postgresSubject(): Promise<Subject> {
	const db = createDatabase(DATABASE_URL ?? "");
	const made: string[] = [];
	return {
		repository: createApiKeyRepository(db),
		account: async (label) => {
			const id = `contract-${label}-${randomBytes(4).toString("hex")}`;
			await db.insert(user).values({ id, name: label, email: `${id}@typelapse.test` });
			made.push(id);
			return id;
		},
		dispose: async () => {
			for (const id of made) {
				await db.$client.query('DELETE FROM "user" WHERE id = $1', [id]);
			}
			await db.$client.end();
		},
	};
}

const subjects: Array<[string, () => Promise<Subject>]> = [["memory", memorySubject]];
if (DATABASE_URL) {
	subjects.push(["PostgreSQL", postgresSubject]);
}

function key(ownerId: string, overrides: Partial<StoredApiKey> = {}): StoredApiKey {
	return {
		ownerId,
		prefix: `tlk_${randomBytes(4).toString("hex")}`,
		name: "GitHub Action",
		secretHash: randomBytes(32).toString("hex"),
		createdAt: T0,
		expiresAt: null,
		lastUsedAt: null,
		...overrides,
	};
}

describe.each(subjects)("the API key repository on %s", (_name, open) => {
	let subject: Subject;
	let repository: ApiKeyRepositoryPort;

	beforeAll(async () => {
		subject = await open();
		repository = subject.repository;
	});
	afterAll(() => subject.dispose());

	it("keeps a key as it was given, dates to the millisecond", async () => {
		const owner = await subject.account("keeper");
		const made = key(owner, {
			expiresAt: new Date("2027-01-01T00:00:00.123Z"),
			lastUsedAt: new Date("2026-10-05T12:30:00.456Z"),
		});

		expect(await repository.insert({ key: made, maxKeys: 10 })).toEqual({ outcome: "created" });

		expect(await repository.findByPrefix(made.prefix)).toEqual(made);
		expect(await repository.findByPrefix("tlk_00000000")).toBeNull();
	});

	it("lists an owner's keys newest first and nobody else's", async () => {
		const owner = await subject.account("lister");
		const other = await subject.account("other");
		const older = key(owner, { name: "older", createdAt: new Date(T0.getTime() - 1000) });
		const newer = key(owner, { name: "newer" });
		for (const made of [older, newer, key(other, { name: "not mine" })]) {
			await repository.insert({ key: made, maxKeys: 10 });
		}

		const listed = await repository.listByOwner(owner);

		expect(listed.map((made) => made.name)).toEqual(["newer", "older"]);
	});

	it("stops at the owner's ceiling and leaves other owners alone", async () => {
		const owner = await subject.account("capped");
		const other = await subject.account("free");
		for (let index = 0; index < 3; index += 1) {
			await repository.insert({ key: key(owner), maxKeys: 3 });
		}

		const over = await repository.insert({ key: key(owner), maxKeys: 3 });
		const elsewhere = await repository.insert({ key: key(other), maxKeys: 3 });

		expect(over).toEqual({ outcome: "limit-reached" });
		expect(elsewhere).toEqual({ outcome: "created" });
		expect(await repository.listByOwner(owner)).toHaveLength(3);
	});

	it("holds the ceiling when creations arrive together", async () => {
		const owner = await subject.account("burst");

		const results = await Promise.all(
			Array.from({ length: 15 }, () => repository.insert({ key: key(owner), maxKeys: 10 })),
		);

		expect(results.filter((result) => result.outcome === "created")).toHaveLength(10);
		expect(results.filter((result) => result.outcome === "limit-reached")).toHaveLength(5);
		expect(await repository.listByOwner(owner)).toHaveLength(10);
	});

	it("refuses a prefix that is taken, after the ceiling and without writing", async () => {
		const first = await subject.account("first");
		const second = await subject.account("second");
		const taken = key(first);
		await repository.insert({ key: taken, maxKeys: 10 });

		const collision = await repository.insert({
			key: key(second, { prefix: taken.prefix }),
			maxKeys: 10,
		});
		const capped = await repository.insert({
			key: key(first, { prefix: taken.prefix }),
			maxKeys: 1,
		});

		expect(collision).toEqual({ outcome: "prefix-taken" });
		expect(capped).toEqual({ outcome: "limit-reached" });
		expect(await repository.listByOwner(second)).toEqual([]);
		expect((await repository.findByPrefix(taken.prefix))?.ownerId).toBe(first);
	});

	it("deletes a key for its owner only", async () => {
		const owner = await subject.account("owner");
		const stranger = await subject.account("stranger");
		const made = key(owner);
		await repository.insert({ key: made, maxKeys: 10 });

		expect(await repository.deleteOwned(stranger, made.prefix)).toBe(false);
		expect(await repository.findByPrefix(made.prefix)).not.toBeNull();
		expect(await repository.deleteOwned(owner, made.prefix)).toBe(true);
		expect(await repository.findByPrefix(made.prefix)).toBeNull();
		expect(await repository.deleteOwned(owner, made.prefix)).toBe(false);
	});

	it("writes the last use, and never takes it backwards", async () => {
		const owner = await subject.account("user");
		const made = key(owner);
		await repository.insert({ key: made, maxKeys: 10 });
		const later = new Date(T0.getTime() + 120_000);

		await repository.recordUse(made.prefix, later);
		await repository.recordUse(made.prefix, new Date(T0.getTime() + 60_000));

		expect((await repository.findByPrefix(made.prefix))?.lastUsedAt).toEqual(later);
	});

	it("answers quietly when the key it was told of is gone", async () => {
		await expect(repository.recordUse("tlk_00000000", T0)).resolves.toBeUndefined();
	});
});
