import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import {
	type RenderJobLease,
	type RenderJobQueuePort,
	createHostedRenderWorker,
} from "@/application/render/hosted-render-worker";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const DOCUMENT = migrateV1ToV2({
	title: "Lease",
	code: "const leased = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const leased = true;", duration: 1000 }],
});

function lease(attempt = 1): RenderJobLease {
	return {
		id: "job-1",
		ownerId: "owner-1",
		projectId: DOCUMENT.project.id,
		revision: 4,
		projectDocument: DOCUMENT,
		renderOptions: {
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: true,
		},
		compilerVersion: "compiler-v2",
		attempt,
		workerId: "worker-a",
		expiresAt: new Date("2026-08-30T20:00:30.000Z"),
	};
}

class MemoryQueue implements RenderJobQueuePort {
	claimed: Parameters<RenderJobQueuePort["claim"]>[0] | null = null;
	heartbeatInput: Parameters<RenderJobQueuePort["heartbeat"]>[0] | null = null;
	successInput: Parameters<RenderJobQueuePort["succeed"]>[0] | null = null;
	failureInput: Parameters<RenderJobQueuePort["fail"]>[0] | null = null;
	nextLease: RenderJobLease | null = lease();
	heartbeatApplied = true;
	successApplied = true;
	failureApplied = true;

	async claim(input: Parameters<RenderJobQueuePort["claim"]>[0]) {
		this.claimed = input;
		return this.nextLease;
	}

	async heartbeat(input: Parameters<RenderJobQueuePort["heartbeat"]>[0]) {
		this.heartbeatInput = input;
		return this.heartbeatApplied;
	}

	async succeed(input: Parameters<RenderJobQueuePort["succeed"]>[0]) {
		this.successInput = input;
		return this.successApplied;
	}

	async fail(input: Parameters<RenderJobQueuePort["fail"]>[0]) {
		this.failureInput = input;
		return this.failureApplied;
	}
}

function setup() {
	const queue = new MemoryQueue();
	return {
		queue,
		worker: createHostedRenderWorker({
			queue,
			now: () => NOW,
			leaseDurationMs: 30_000,
			maxAttempts: 3,
			retryDelayMs: (attempt) => attempt * 2_000,
		}),
	};
}

describe("hosted render worker lease", () => {
	it("claims work with a bounded lease", async () => {
		const { queue, worker } = setup();

		await expect(worker.claim("worker-a")).resolves.toEqual(lease());
		expect(queue.claimed).toEqual({
			workerId: "worker-a",
			now: NOW,
			leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
			maxAttempts: 3,
		});
	});

	it("heartbeats only the fenced attempt and reports a lost lease", async () => {
		const { queue, worker } = setup();
		queue.heartbeatApplied = false;

		await expect(worker.heartbeat(lease(2))).resolves.toBe("lease-lost");
		expect(queue.heartbeatInput).toEqual({
			jobId: "job-1",
			workerId: "worker-a",
			attempt: 2,
			now: NOW,
			leaseExpiresAt: new Date("2026-08-30T20:00:30.000Z"),
		});
	});

	it("completes only the fenced, unexpired attempt", async () => {
		const { queue, worker } = setup();
		queue.successApplied = false;

		await expect(
			worker.succeed(lease(2), {
				objectKey: "accounts/owner-1/renders/job-1.mp4",
				mimeType: "video/mp4",
				byteSize: 42_000,
			}),
		).resolves.toBe("lease-lost");
		expect(queue.successInput).toMatchObject({
			jobId: "job-1",
			workerId: "worker-a",
			attempt: 2,
			now: NOW,
		});
	});

	it("schedules deterministic backoff while attempts remain", async () => {
		const { queue, worker } = setup();

		await expect(
			worker.fail(lease(2), { code: "render-crashed", message: "renderer exited" }),
		).resolves.toBe("retry-scheduled");
		expect(queue.failureInput).toEqual({
			jobId: "job-1",
			workerId: "worker-a",
			attempt: 2,
			now: NOW,
			error: { code: "render-crashed", message: "renderer exited" },
			retryAt: new Date("2026-08-30T20:00:04.000Z"),
		});
	});

	it("fails terminally at the attempt limit and never retries a lost lease", async () => {
		const { queue, worker } = setup();

		await expect(
			worker.fail(lease(3), { code: "render-crashed", message: "renderer exited" }),
		).resolves.toBe("failed");
		expect(queue.failureInput?.retryAt).toBeNull();

		queue.failureApplied = false;
		await expect(
			worker.fail(lease(1), { code: "render-crashed", message: "stale worker" }),
		).resolves.toBe("lease-lost");
	});

	it("fails a permanently unsupported render without spending every retry", async () => {
		const { queue, worker } = setup();

		await expect(
			worker.fail(lease(1), {
				code: "multimedia-renderer-unavailable",
				message: "The deployed renderer is code-only",
				retryable: false,
			}),
		).resolves.toBe("failed");
		expect(queue.failureInput?.retryAt).toBeNull();
	});
});
