import type { ObjectDeletePort } from "./object-delete.port";

export interface ObjectDeletionLease {
	readonly id: string;
	readonly objectKey: string;
	/** Monotonic fencing token incremented on every claim or expired-lease recovery. */
	readonly attempt: number;
	readonly workerId: string;
	readonly expiresAt: Date;
}

export interface ObjectDeletionQueuePort {
	claim(input: {
		readonly workerId: string;
		readonly now: Date;
		readonly leaseExpiresAt: Date;
	}): Promise<ObjectDeletionLease | null>;
	succeed(input: {
		readonly entryId: string;
		readonly workerId: string;
		readonly attempt: number;
		readonly now: Date;
	}): Promise<boolean>;
	fail(input: {
		readonly entryId: string;
		readonly workerId: string;
		readonly attempt: number;
		readonly now: Date;
		readonly errorMessage: string;
		readonly retryAt: Date;
	}): Promise<boolean>;
}

export type ObjectDeletionRunResult = "idle" | "deleted" | "retry-scheduled" | "lease-lost";

export interface ObjectDeletionWorker {
	runOnce(workerId: string): Promise<ObjectDeletionRunResult>;
}

const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;

export function objectDeletionRetryDelayMs(
	attempt: number,
	baseDelayMs = DEFAULT_BASE_RETRY_DELAY_MS,
	maxDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
): number {
	if (!Number.isSafeInteger(attempt) || attempt <= 0) {
		throw new Error("Object deletion attempt must be a positive integer");
	}
	if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs <= 0) {
		throw new Error("Object deletion base retry delay must be positive");
	}
	if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < baseDelayMs) {
		throw new Error("Object deletion maximum retry delay must cover the base delay");
	}
	const exponent = Math.min(attempt - 1, 52);
	return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
}

function requiredWorkerId(value: string): string {
	const workerId = value.trim();
	if (!workerId) {
		throw new Error("Object deletion worker id is required");
	}
	return workerId;
}

function deletionFailureMessage(error: unknown): string {
	return error instanceof Error
		? "Object storage deletion failed"
		: "Unknown object deletion failure";
}

export function createObjectDeletionWorker(input: {
	readonly queue: ObjectDeletionQueuePort;
	readonly objects: ObjectDeletePort;
	readonly leaseDurationMs: number;
	readonly now?: () => Date;
	readonly retryDelayMs?: (attempt: number) => number;
}): ObjectDeletionWorker {
	if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
		throw new Error("Object deletion lease duration must be a positive integer");
	}
	const now = input.now ?? (() => new Date());
	const retryDelayMs = input.retryDelayMs ?? objectDeletionRetryDelayMs;

	return {
		async runOnce(rawWorkerId) {
			const workerId = requiredWorkerId(rawWorkerId);
			const claimTime = now();
			const lease = await input.queue.claim({
				workerId,
				now: claimTime,
				leaseExpiresAt: new Date(claimTime.getTime() + input.leaseDurationMs),
			});
			if (!lease) {
				return "idle";
			}

			try {
				await input.objects.deleteObject(lease.objectKey);
			} catch (error) {
				const failureTime = now();
				const delayMs = retryDelayMs(lease.attempt);
				if (!Number.isSafeInteger(delayMs) || delayMs <= 0) {
					throw new Error("Object deletion retry delay must be a positive integer");
				}
				const applied = await input.queue.fail({
					entryId: lease.id,
					workerId: lease.workerId,
					attempt: lease.attempt,
					now: failureTime,
					errorMessage: deletionFailureMessage(error),
					retryAt: new Date(failureTime.getTime() + delayMs),
				});
				return applied ? "retry-scheduled" : "lease-lost";
			}

			const applied = await input.queue.succeed({
				entryId: lease.id,
				workerId: lease.workerId,
				attempt: lease.attempt,
				now: now(),
			});
			return applied ? "deleted" : "lease-lost";
		},
	};
}
