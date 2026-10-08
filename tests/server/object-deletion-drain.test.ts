// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ObjectDeletePort } from "../../src/application/assets/object-delete.port";
import type { ObjectDeletionQueuePort } from "../../src/application/assets/object-deletion-worker";
import { launchObjectDeletionWorker } from "../../server/workers/object-deletion.entrypoint";
import {
	createObjectDeletionRuntimeFromEnv,
	objectDeletionRuntimeConfigFromEnv,
} from "../../server/workers/object-deletion-runtime";
import {
	closableDatabase,
	recordingSleep,
	type ScriptedClaim,
	scriptedClaims,
	ShutdownSignals,
} from "./support/worker-harness";

/**
 * The deletion worker runs as a scheduled job: with
 * TYPELAPSE_WORKER_EXIT_WHEN_IDLE it deletes what the outbox has due and exits 0
 * the first time a claim comes back empty. These go through the real runtime
 * and worker; only the outbox, the object store and the database pool are fakes.
 */

const DRAIN = { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" } as const;

function deletionWorker(input: {
	readonly claims: ReadonlyArray<ScriptedClaim>;
	readonly environment: Readonly<Record<string, string>>;
	/** SIGTERM after this many sleeps (once by default). */
	readonly stopAfterSleeps?: number;
	/** The delete only ends when SIGTERM has been sent. */
	readonly deleteUntilStopped?: boolean;
}) {
	const signals = new ShutdownSignals();
	const { database, pool } = closableDatabase();
	const { sleeps, sleep } = recordingSleep(signals, input.stopAfterSleeps);
	const script = scriptedClaims(input.claims, (index) => `entry-${index}`);
	const succeeded: string[] = [];
	const deleted: string[] = [];
	const errors: string[] = [];
	const queue: ObjectDeletionQueuePort = {
		async claim(claim) {
			const id = script.next();
			if (!id) {
				return null;
			}
			return {
				id,
				objectKey: `accounts/owner-1/objects/${id}`,
				attempt: 1,
				workerId: claim.workerId,
				expiresAt: claim.leaseExpiresAt,
			};
		},
		async succeed(command) {
			succeeded.push(command.entryId);
			return true;
		},
		fail: async () => true,
	};
	const objects: ObjectDeletePort = {
		async deleteObject(objectKey) {
			deleted.push(objectKey);
			if (input.deleteUntilStopped) {
				await new Promise<void>((resolve) => signals.once("SIGTERM", resolve));
			}
		},
	};
	const logger = { info: () => undefined, error: (message: string) => errors.push(message) };

	const launch = () =>
		launchObjectDeletionWorker({
			signals,
			logger,
			createRuntime: () =>
				createObjectDeletionRuntimeFromEnv({
					environment: input.environment,
					workerId: "deletion-worker-a",
					logger,
					databaseFactory: () => database,
					storageFactory: () => objects,
					queueFactory: () => queue,
					sleep,
				}),
		});
	return { launch, signals, claims: script.claims, deleted, succeeded, sleeps, pool, errors };
}

describe("draining the object deletion outbox, for scheduled jobs", () => {
	it("exits 0 without sleeping when nothing is due, and closes the pool", async () => {
		const worker = deletionWorker({ claims: [], environment: DRAIN });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null]);
		expect(worker.deleted).toEqual([]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
	});

	it("deletes the three due objects, then exits 0", async () => {
		const worker = deletionWorker({ claims: ["item", "item", "item"], environment: DRAIN });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.deleted).toEqual([
			"accounts/owner-1/objects/entry-1",
			"accounts/owner-1/objects/entry-2",
			"accounts/owner-1/objects/entry-3",
		]);
		expect(worker.succeeded).toEqual(["entry-1", "entry-2", "entry-3"]);
		expect(worker.claims).toEqual(["item-1", "item-2", "item-3", null]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
	});

	it("keeps polling an empty outbox when the variable is unset", async () => {
		const worker = deletionWorker({ claims: [], environment: {}, stopAfterSleeps: 3 });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null, null, null]);
		expect(worker.sleeps).toEqual([250, 500, 1_000]);
		expect(worker.pool.closed).toBe(1);
	});

	it("waits the failure delay after a claim that throws, then carries on draining", async () => {
		const worker = deletionWorker({
			claims: ["throws", "item", "throws", "throws"],
			environment: DRAIN,
			stopAfterSleeps: 4,
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual(["throws", "item-1", "throws", "throws", null]);
		expect(worker.succeeded).toEqual(["entry-1"]);
		expect(worker.sleeps).toEqual([5_000, 5_000, 5_000]);
		expect(worker.errors.join(" ")).not.toContain("secret");
	});

	it("exits 1 after three failed iterations in a row, and closes the pool", async () => {
		const worker = deletionWorker({
			claims: ["throws", "throws", "throws", "item"],
			environment: DRAIN,
			stopAfterSleeps: 3,
		});

		await expect(worker.launch()).resolves.toBe(1);

		expect(worker.claims).toEqual(["throws", "throws", "throws"]);
		expect(worker.sleeps).toEqual([5_000, 5_000]);
		expect(worker.errors).toContain(
			"Object deletion worker stopped after 3 failed iterations in a row",
		);
		expect(worker.errors.join(" ")).not.toContain("secret");
		expect(worker.pool.closed).toBe(1);
	});

	it("keeps retrying failures without that limit when the variable is unset", async () => {
		const worker = deletionWorker({
			claims: ["throws", "throws", "throws", "throws"],
			environment: {},
			stopAfterSleeps: 4,
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual(["throws", "throws", "throws", "throws"]);
		expect(worker.sleeps).toEqual([5_000, 5_000, 5_000, 5_000]);
	});

	it("finishes the delete in progress on SIGTERM and exits 0 without claiming again", async () => {
		const worker = deletionWorker({
			claims: ["item", "item"],
			environment: DRAIN,
			deleteUntilStopped: true,
		});

		const running = worker.launch();
		await vi.waitFor(() => expect(worker.deleted).toHaveLength(1));
		expect(worker.pool.closed).toBe(0);
		worker.signals.emit("SIGTERM");

		await expect(running).resolves.toBe(0);
		expect(worker.claims).toEqual(["item-1"]);
		expect(worker.succeeded).toEqual(["entry-1"]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
	});

	it("reads the variable as true or false, off when unset, and refuses anything else", () => {
		expect(objectDeletionRuntimeConfigFromEnv({}).exitWhenIdle).toBe(false);
		expect(
			objectDeletionRuntimeConfigFromEnv({ TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" })
				.exitWhenIdle,
		).toBe(true);
		expect(
			objectDeletionRuntimeConfigFromEnv({ TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "false" })
				.exitWhenIdle,
		).toBe(false);
		for (const value of ["1", "yes", "TRUE", ""]) {
			expect(() =>
				objectDeletionRuntimeConfigFromEnv({ TYPELAPSE_WORKER_EXIT_WHEN_IDLE: value }),
			).toThrow("TYPELAPSE_WORKER_EXIT_WHEN_IDLE must be true or false");
		}
	});
});
