import type { ObjectDeletePort } from "@/application/assets/object-delete.port";
import {
	type ObjectDeletionLease,
	type ObjectDeletionQueuePort,
	createObjectDeletionWorker,
	objectDeletionRetryDelayMs,
} from "@/application/assets/object-deletion-worker";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-30T20:00:00.000Z");

function lease(attempt = 1): ObjectDeletionLease {
	return {
		id: "asset-1",
		objectKey: "accounts/owner-1/projects/project-1/assets/asset-1",
		attempt,
		workerId: "worker-a",
		expiresAt: new Date("2026-08-30T20:00:30.000Z"),
	};
}

class MemoryQueue implements ObjectDeletionQueuePort {
	claimInput: Parameters<ObjectDeletionQueuePort["claim"]>[0] | null = null;
	successInput: Parameters<ObjectDeletionQueuePort["succeed"]>[0] | null = null;
	failureInput: Parameters<ObjectDeletionQueuePort["fail"]>[0] | null = null;
	nextLease: ObjectDeletionLease | null = lease();
	successApplied = true;
	failureApplied = true;

	async claim(input: Parameters<ObjectDeletionQueuePort["claim"]>[0]) {
		this.claimInput = input;
		return this.nextLease;
	}

	async succeed(input: Parameters<ObjectDeletionQueuePort["succeed"]>[0]) {
		this.successInput = input;
		return this.successApplied;
	}

	async fail(input: Parameters<ObjectDeletionQueuePort["fail"]>[0]) {
		this.failureInput = input;
		return this.failureApplied;
	}
}

class MemoryObjectDelete implements ObjectDeletePort {
	readonly deleted: string[] = [];
	error: Error | null = null;

	async deleteObject(objectKey: string): Promise<void> {
		this.deleted.push(objectKey);
		if (this.error) {
			throw this.error;
		}
	}
}

function setup() {
	const queue = new MemoryQueue();
	const objects = new MemoryObjectDelete();
	return {
		queue,
		objects,
		worker: createObjectDeletionWorker({
			queue,
			objects,
			now: () => NOW,
			leaseDurationMs: 30_000,
			retryDelayMs: (attempt) => attempt * 2_000,
		}),
	};
}

describe("durable object deletion worker", () => {
	it("claims one deletion with a bounded lease and remains idle when none is ready", async () => {
		const { queue, objects, worker } = setup();
		queue.nextLease = null;

		await expect(worker.runOnce("worker-a")).resolves.toBe("idle");
		expect(queue.claimInput).toEqual({
			workerId: "worker-a",
			now: NOW,
			leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
		});
		expect(objects.deleted).toEqual([]);
	});

	it("deletes idempotently before acknowledging the fenced lease", async () => {
		const { queue, objects, worker } = setup();

		await expect(worker.runOnce("worker-a")).resolves.toBe("deleted");
		expect(objects.deleted).toEqual(["accounts/owner-1/projects/project-1/assets/asset-1"]);
		expect(queue.successInput).toEqual({
			entryId: "asset-1",
			workerId: "worker-a",
			attempt: 1,
			now: NOW,
		});
	});

	it("leaves an already-deleted object recoverable when the lease was lost", async () => {
		const { queue, worker } = setup();
		queue.successApplied = false;

		await expect(worker.runOnce("worker-a")).resolves.toBe("lease-lost");
	});

	it("persists deterministic backoff after a deletion failure", async () => {
		const { queue, objects, worker } = setup();
		queue.nextLease = lease(3);
		objects.error = new Error("provider unavailable");

		await expect(worker.runOnce("worker-a")).resolves.toBe("retry-scheduled");
		expect(queue.failureInput).toEqual({
			entryId: "asset-1",
			workerId: "worker-a",
			attempt: 3,
			now: NOW,
			errorMessage: "Object storage deletion failed",
			retryAt: new Date("2026-08-30T20:00:06.000Z"),
		});
	});

	it("caps exponential retry delays without ever dropping the durable entry", () => {
		expect(objectDeletionRetryDelayMs(1)).toBe(1_000);
		expect(objectDeletionRetryDelayMs(5)).toBe(16_000);
		expect(objectDeletionRetryDelayMs(30)).toBe(3_600_000);
	});
});
