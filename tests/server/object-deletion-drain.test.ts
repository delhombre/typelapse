// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { ObjectDeletePort } from "../../src/application/assets/object-delete.port";
import type { ObjectDeletionQueuePort } from "../../src/application/assets/object-deletion-worker";
import type { CreatorDatabase } from "../../server/db/database";
import { launchObjectDeletionWorker } from "../../server/workers/object-deletion.entrypoint";
import {
	createObjectDeletionRuntimeFromEnv,
	objectDeletionRuntimeConfigFromEnv,
} from "../../server/workers/object-deletion-runtime";

/**
 * The deletion worker can run as a scheduled job: with
 * TYPELAPSE_WORKER_EXIT_WHEN_IDLE it deletes what the outbox has due and
 * exits 0 the first time a claim comes back empty. These go through the real
 * runtime and worker; only the outbox and the object store are fakes.
 */

class Signals extends EventEmitter {
	override once(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.once(event, listener);
	}

	override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.off(event, listener);
	}
}

/** An outbox holding `entries` due deletions, handed out once each. */
function outboxOf(entries: number) {
	const waiting = Array.from({ length: entries }, (_, index) => `entry-${index + 1}`);
	const claims: Array<string | null> = [];
	const succeeded: string[] = [];
	const queue: ObjectDeletionQueuePort = {
		async claim(input) {
			const id = waiting.shift() ?? null;
			claims.push(id);
			if (!id) {
				return null;
			}
			return {
				id,
				objectKey: `accounts/owner-1/objects/${id}`,
				attempt: 1,
				workerId: input.workerId,
				expiresAt: input.leaseExpiresAt,
			};
		},
		async succeed(input) {
			succeeded.push(input.entryId);
			return true;
		},
		fail: async () => true,
	};
	return { queue, claims, succeeded };
}

function deletionWorker(input: {
	readonly entries: number;
	readonly environment: Readonly<Record<string, string>>;
	/** Sends SIGTERM once the worker has slept this many times (once by default, so a worker that should have exited fails fast instead of spinning). */
	readonly stopAfterSleeps?: number;
}) {
	const signals = new Signals();
	const { queue, claims, succeeded } = outboxOf(input.entries);
	const deleted: string[] = [];
	const sleeps: number[] = [];
	const objects: ObjectDeletePort = {
		async deleteObject(objectKey) {
			deleted.push(objectKey);
		},
	};

	const launch = () =>
		launchObjectDeletionWorker({
			signals,
			logger: { info: () => undefined, error: () => undefined },
			createRuntime: () =>
				createObjectDeletionRuntimeFromEnv({
					environment: input.environment,
					workerId: "deletion-worker-a",
					databaseFactory: () => ({}) as CreatorDatabase,
					storageFactory: () => objects,
					queueFactory: () => queue,
					sleep: async (delayMs) => {
						sleeps.push(delayMs);
						if (sleeps.length === (input.stopAfterSleeps ?? 1)) {
							signals.emit("SIGTERM");
						}
					},
				}),
		});
	return { launch, claims, deleted, succeeded, sleeps };
}

describe("draining the object deletion outbox, for scheduled jobs", () => {
	it("exits 0 without sleeping when nothing is due", async () => {
		const worker = deletionWorker({
			entries: 0,
			environment: { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" },
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null]);
		expect(worker.deleted).toEqual([]);
		expect(worker.sleeps).toEqual([]);
	});

	it("deletes the three due objects, then exits 0", async () => {
		const worker = deletionWorker({
			entries: 3,
			environment: { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" },
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.deleted).toEqual([
			"accounts/owner-1/objects/entry-1",
			"accounts/owner-1/objects/entry-2",
			"accounts/owner-1/objects/entry-3",
		]);
		expect(worker.succeeded).toEqual(["entry-1", "entry-2", "entry-3"]);
		expect(worker.claims).toEqual(["entry-1", "entry-2", "entry-3", null]);
		expect(worker.sleeps).toEqual([]);
	});

	it("keeps polling an empty outbox when the variable is unset", async () => {
		const worker = deletionWorker({ entries: 0, environment: {}, stopAfterSleeps: 3 });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null, null, null]);
		expect(worker.sleeps).toEqual([250, 500, 1_000]);
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
