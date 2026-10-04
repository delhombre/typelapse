import type { ProjectDocumentV2 } from "../project/project-document";
import type { HostedRenderOptions } from "./hosted-render-job";

export interface RenderJobLease {
	readonly id: string;
	readonly ownerId: string;
	readonly projectId: string;
	readonly revision: number;
	readonly projectDocument: ProjectDocumentV2;
	readonly renderOptions: HostedRenderOptions;
	readonly compilerVersion: string;
	/** Monotonic fencing token incremented by the atomic claim operation. */
	readonly attempt: number;
	readonly workerId: string;
	readonly expiresAt: Date;
}

export interface RenderJobOutput {
	readonly objectKey: string;
	readonly mimeType: string;
	readonly byteSize: number;
}

export interface RenderJobFailure {
	readonly code: string;
	readonly message: string;
	/** Permanent capability/configuration failures must not burn retry capacity. */
	readonly retryable?: boolean;
}

interface FencedRenderJobCommand {
	readonly jobId: string;
	readonly workerId: string;
	readonly attempt: number;
	readonly now: Date;
}

export interface RenderJobQueuePort {
	claim(input: {
		readonly workerId: string;
		readonly now: Date;
		readonly leaseExpiresAt: Date;
		readonly maxAttempts: number;
	}): Promise<RenderJobLease | null>;
	heartbeat(input: FencedRenderJobCommand & { readonly leaseExpiresAt: Date }): Promise<boolean>;
	succeed(input: FencedRenderJobCommand & { readonly output: RenderJobOutput }): Promise<boolean>;
	fail(
		input: FencedRenderJobCommand & {
			readonly error: RenderJobFailure;
			/** Null means the attempt limit has been reached. */
			readonly retryAt: Date | null;
		},
	): Promise<boolean>;
}

export interface HostedRenderWorker {
	claim(workerId: string): Promise<RenderJobLease | null>;
	heartbeat(lease: RenderJobLease): Promise<"extended" | "lease-lost">;
	succeed(lease: RenderJobLease, output: RenderJobOutput): Promise<"succeeded" | "lease-lost">;
	fail(
		lease: RenderJobLease,
		error: RenderJobFailure,
	): Promise<"retry-scheduled" | "failed" | "lease-lost">;
}

function positiveInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${label} must be a positive integer`);
	}
	return value;
}

function nonEmpty(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`${label} must not be empty`);
	}
	return normalized;
}

function fencedCommand(lease: RenderJobLease, now: Date): FencedRenderJobCommand {
	return {
		jobId: nonEmpty(lease.id, "Render job id"),
		workerId: nonEmpty(lease.workerId, "Render worker id"),
		attempt: positiveInteger(lease.attempt, "Render attempt"),
		now,
	};
}

/**
 * Worker-side orchestration. Persistence owns the compare-and-set; this use case
 * owns lease duration, the attempt ceiling and deterministic retry policy.
 */
export function createHostedRenderWorker(input: {
	readonly queue: RenderJobQueuePort;
	readonly now?: () => Date;
	readonly leaseDurationMs: number;
	readonly maxAttempts: number;
	readonly retryDelayMs: (attempt: number) => number;
}): HostedRenderWorker {
	const leaseDurationMs = positiveInteger(input.leaseDurationMs, "Render lease duration");
	const maxAttempts = positiveInteger(input.maxAttempts, "Render max attempts");
	const now = input.now ?? (() => new Date());
	const leaseExpiry = (time: Date) => new Date(time.getTime() + leaseDurationMs);

	return {
		claim(workerId) {
			const claimedAt = now();
			return input.queue.claim({
				workerId: nonEmpty(workerId, "Render worker id"),
				now: claimedAt,
				leaseExpiresAt: leaseExpiry(claimedAt),
				maxAttempts,
			});
		},

		async heartbeat(lease) {
			const heartbeatAt = now();
			const applied = await input.queue.heartbeat({
				...fencedCommand(lease, heartbeatAt),
				leaseExpiresAt: leaseExpiry(heartbeatAt),
			});
			return applied ? "extended" : "lease-lost";
		},

		async succeed(lease, output) {
			const normalizedOutput: RenderJobOutput = {
				objectKey: nonEmpty(output.objectKey, "Render output object key"),
				mimeType: nonEmpty(output.mimeType, "Render output mime type"),
				byteSize: positiveInteger(output.byteSize, "Render output byte size"),
			};
			const applied = await input.queue.succeed({
				...fencedCommand(lease, now()),
				output: normalizedOutput,
			});
			return applied ? "succeeded" : "lease-lost";
		},

		async fail(lease, error) {
			const failedAt = now();
			const attempt = positiveInteger(lease.attempt, "Render attempt");
			let retryAt: Date | null = null;
			if (error.retryable !== false && attempt < maxAttempts) {
				const delayMs = input.retryDelayMs(attempt);
				if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
					throw new Error("Render retry delay must be a non-negative integer");
				}
				retryAt = new Date(failedAt.getTime() + delayMs);
			}
			const applied = await input.queue.fail({
				...fencedCommand(lease, failedAt),
				error: {
					code: nonEmpty(error.code, "Render failure code"),
					message: nonEmpty(error.message, "Render failure message"),
				},
				retryAt,
			});
			if (!applied) {
				return "lease-lost";
			}
			return retryAt ? "retry-scheduled" : "failed";
		},
	};
}
