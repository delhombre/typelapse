import { describe, expect, it, vi } from "vitest";
import type { ObjectDeletePort } from "../../src/application/assets/object-delete.port";
import type {
	ObjectDeletionQueuePort,
	ObjectDeletionRunResult,
	ObjectDeletionWorker,
} from "../../src/application/assets/object-deletion-worker";
import type { CreatorDatabase } from "../../server/db/database";
import {
	createObjectDeletionRuntimeFromEnv,
	objectDeletionRuntimeConfigFromEnv,
	runObjectDeletionLoop,
	sleepUntilDelayOrAbort,
} from "../../server/workers/object-deletion-runtime";

class ScriptedWorker implements ObjectDeletionWorker {
	readonly calls: string[] = [];
	readonly outcomes: Array<ObjectDeletionRunResult | Error>;

	constructor(...outcomes: Array<ObjectDeletionRunResult | Error>) {
		this.outcomes = outcomes;
	}

	async runOnce(workerId: string): Promise<ObjectDeletionRunResult> {
		this.calls.push(workerId);
		const outcome = this.outcomes.shift() ?? "idle";
		if (outcome instanceof Error) {
			throw outcome;
		}
		return outcome;
	}
}

describe("object deletion runtime configuration", () => {
	it("uses conservative bounded polling defaults", () => {
		expect(objectDeletionRuntimeConfigFromEnv({})).toEqual({
			leaseDurationMs: 30_000,
			idleMinDelayMs: 250,
			idleMaxDelayMs: 5_000,
			failureDelayMs: 5_000,
		});
	});

	it("accepts bounded integer overrides and rejects impossible ranges", () => {
		expect(
			objectDeletionRuntimeConfigFromEnv({
				TYPELAPSE_OBJECT_DELETION_LEASE_MS: "45000",
				TYPELAPSE_OBJECT_DELETION_IDLE_MIN_MS: "100",
				TYPELAPSE_OBJECT_DELETION_IDLE_MAX_MS: "800",
				TYPELAPSE_OBJECT_DELETION_FAILURE_MS: "1200",
			}),
		).toEqual({
			leaseDurationMs: 45_000,
			idleMinDelayMs: 100,
			idleMaxDelayMs: 800,
			failureDelayMs: 1_200,
		});
		expect(() =>
			objectDeletionRuntimeConfigFromEnv({
				TYPELAPSE_OBJECT_DELETION_IDLE_MIN_MS: "900",
				TYPELAPSE_OBJECT_DELETION_IDLE_MAX_MS: "800",
			}),
		).toThrow(/idle maximum/i);
	});

	it("refuses to compose without both database and complete R2 configuration", () => {
		expect(() => createObjectDeletionRuntimeFromEnv({ environment: {} })).toThrow(
			/Database configuration is required/,
		);
		expect(() =>
			createObjectDeletionRuntimeFromEnv({
				environment: { DATABASE_URL: "postgresql://local.invalid/db" },
				databaseFactory: () => ({}) as CreatorDatabase,
			}),
		).toThrow(/Object storage configuration is required/);
	});

	it("wires the DB queue, private object delete port and application worker", () => {
		const database = {} as CreatorDatabase;
		const queue = {} as ObjectDeletionQueuePort;
		const objects = { deleteObject: vi.fn() } satisfies ObjectDeletePort;
		const worker = new ScriptedWorker("idle");
		const queueFactory = vi.fn(() => queue);
		const workerFactory = vi.fn(() => worker);

		createObjectDeletionRuntimeFromEnv({
			environment: {
				DATABASE_URL: "postgresql://local.invalid/db",
				R2_ENDPOINT: "https://objects.example.test",
				R2_ACCESS_KEY_ID: "access",
				R2_SECRET_ACCESS_KEY: "secret",
				R2_BUCKET: "private",
			},
			workerId: "worker-a",
			databaseFactory: () => database,
			storageFactory: () => objects,
			queueFactory,
			workerFactory,
		});

		expect(queueFactory).toHaveBeenCalledWith(database);
		expect(workerFactory).toHaveBeenCalledWith(
			expect.objectContaining({ queue, objects, leaseDurationMs: 30_000 }),
		);
	});
});

describe("object deletion runtime loop", () => {
	it("releases a pending idle delay immediately when shutdown is requested", async () => {
		const controller = new AbortController();
		const sleeping = sleepUntilDelayOrAbort(60_000, controller.signal);

		controller.abort();

		await expect(sleeping).resolves.toBeUndefined();
	});

	it("backs off exponentially while idle, capped without busy-spinning", async () => {
		const controller = new AbortController();
		const delays: number[] = [];
		const worker = new ScriptedWorker("idle", "idle", "idle", "idle");

		await runObjectDeletionLoop({
			worker,
			workerId: "worker-a",
			signal: controller.signal,
			idleMinDelayMs: 100,
			idleMaxDelayMs: 250,
			failureDelayMs: 500,
			sleep: async (delayMs) => {
				delays.push(delayMs);
				if (delays.length === 4) {
					controller.abort();
				}
			},
		});

		expect(delays).toEqual([100, 200, 250, 250]);
		expect(worker.calls).toHaveLength(4);
	});

	it("resets idle backoff after useful work", async () => {
		const controller = new AbortController();
		const delays: number[] = [];
		const worker = new ScriptedWorker("idle", "deleted", "idle");

		await runObjectDeletionLoop({
			worker,
			workerId: "worker-a",
			signal: controller.signal,
			idleMinDelayMs: 100,
			idleMaxDelayMs: 800,
			failureDelayMs: 500,
			sleep: async (delayMs) => {
				delays.push(delayMs);
				if (delays.length === 2) {
					controller.abort();
				}
			},
		});

		expect(delays).toEqual([100, 100]);
	});

	it("logs only a generic failure and waits before retrying", async () => {
		const controller = new AbortController();
		const errors: string[] = [];
		const delays: number[] = [];
		const worker = new ScriptedWorker(
			new Error("secret key accounts/owner/project/object"),
		);

		await runObjectDeletionLoop({
			worker,
			workerId: "worker-a",
			signal: controller.signal,
			idleMinDelayMs: 100,
			idleMaxDelayMs: 800,
			failureDelayMs: 700,
			logger: { error: (message) => errors.push(message), info: () => undefined },
			sleep: async (delayMs) => {
				delays.push(delayMs);
				controller.abort();
			},
		});

		expect(delays).toEqual([700]);
		expect(errors).toEqual(["Object deletion worker iteration failed"]);
		expect(errors.join(" ")).not.toContain("secret");
		expect(errors.join(" ")).not.toContain("accounts/");
	});
});
