// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import type { HostedMultimediaRendererPort } from "../../src/application/render/process-hosted-render-job";
import type {
	RenderJobLease,
	RenderJobQueuePort,
} from "../../src/application/render/hosted-render-worker";
import type { CreatorDatabase } from "../../server/db/database";
import type { HostedRenderObjectStorage } from "../../server/storage/hosted-render-object-storage";
import { launchHostedRenderWorker } from "../../server/workers/hosted-render.entrypoint";
import {
	createHostedRenderRuntimeFromEnv,
	hostedRenderRuntimeConfigFromEnv,
} from "../../server/workers/hosted-render-runtime";

/**
 * The render worker can run as a scheduled job that drains the queue: with
 * TYPELAPSE_WORKER_EXIT_WHEN_IDLE it renders what it can claim and
 * exits 0 the first time a claim comes back empty. These go through the real
 * runtime, worker and processor; only the queue, the renderer and the storage
 * are fakes.
 */

const COMPILER_VERSION = "compiler-v2";
const DOCUMENT = migrateV1ToV2({
	title: "Drain",
	code: "const drained = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const drained = true;", duration: 1000 }],
});

class Signals extends EventEmitter {
	override once(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.once(event, listener);
	}

	override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.off(event, listener);
	}
}

/** A queue holding `jobs` claimable renders, handed out once each. */
function queueOf(jobs: number) {
	const waiting = Array.from({ length: jobs }, (_, index) => `job-${index + 1}`);
	const claims: Array<string | null> = [];
	const succeeded: string[] = [];
	const queue: RenderJobQueuePort = {
		async claim(input) {
			const id = waiting.shift() ?? null;
			claims.push(id);
			if (!id) {
				return null;
			}
			const lease: RenderJobLease = {
				id,
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 1,
				projectDocument: DOCUMENT,
				renderOptions: {
					format: "mp4",
					width: 1920,
					height: 1080,
					fps: 30,
					includeAudio: false,
				},
				compilerVersion: COMPILER_VERSION,
				attempt: 1,
				workerId: input.workerId,
				expiresAt: input.leaseExpiresAt,
			};
			return lease;
		},
		heartbeat: async () => true,
		async succeed(input) {
			succeeded.push(input.jobId);
			return true;
		},
		fail: async () => true,
	};
	return { queue, claims, succeeded };
}

function renderWorker(input: {
	readonly jobs: number;
	readonly environment: Readonly<Record<string, string>>;
	/** Sends SIGTERM once the worker has slept this many times (once by default, so a worker that should have exited fails fast instead of spinning). */
	readonly stopAfterSleeps?: number;
}) {
	const signals = new Signals();
	const { queue, claims, succeeded } = queueOf(input.jobs);
	const renders: string[] = [];
	const sleeps: number[] = [];
	const renderer: HostedMultimediaRendererPort = {
		async render(job) {
			renders.push(job.jobId);
			return { temporaryId: `/tmp/${job.jobId}.mp4`, mimeType: "video/mp4", byteSize: 1 };
		},
		cleanup: async () => undefined,
	};
	const storage = {
		materializePrivateAsset: async () => {
			throw new Error("This project has no private asset");
		},
		storePrivate: async () => undefined,
		deletePrivate: async () => undefined,
	} as unknown as HostedRenderObjectStorage;

	const launch = () =>
		launchHostedRenderWorker({
			signals,
			logger: { info: () => undefined, error: () => undefined },
			createRuntime: () =>
				createHostedRenderRuntimeFromEnv({
					environment: { TYPELAPSE_COMPILER_VERSION: COMPILER_VERSION, ...input.environment },
					workerId: "render-worker-a",
					databaseFactory: () => ({}) as CreatorDatabase,
					assetRepositoryFactory: () => ({}) as AssetRepositoryPort,
					storageFactory: () => storage,
					queueFactory: () => queue,
					rendererFactory: () => renderer,
					sleep: async (delayMs) => {
						sleeps.push(delayMs);
						if (sleeps.length === (input.stopAfterSleeps ?? 1)) {
							signals.emit("SIGTERM");
						}
					},
				}),
		});
	return { launch, claims, renders, succeeded, sleeps };
}

describe("draining the render queue, for scheduled jobs", () => {
	it("exits 0 without sleeping when the queue is empty", async () => {
		const worker = renderWorker({
			jobs: 0,
			environment: { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" },
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null]);
		expect(worker.renders).toEqual([]);
		expect(worker.sleeps).toEqual([]);
	});

	it("renders the three claimable jobs, then exits 0", async () => {
		const worker = renderWorker({
			jobs: 3,
			environment: { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" },
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.renders).toEqual(["job-1", "job-2", "job-3"]);
		expect(worker.succeeded).toEqual(["job-1", "job-2", "job-3"]);
		expect(worker.claims).toEqual(["job-1", "job-2", "job-3", null]);
		expect(worker.sleeps).toEqual([]);
	});

	it("keeps polling an empty queue when the variable is unset", async () => {
		const worker = renderWorker({ jobs: 0, environment: {}, stopAfterSleeps: 3 });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null, null, null]);
		expect(worker.sleeps).toEqual([250, 500, 1_000]);
	});

	it("reads the variable as true or false, off when unset, and refuses anything else", () => {
		const base = { TYPELAPSE_COMPILER_VERSION: COMPILER_VERSION };

		expect(hostedRenderRuntimeConfigFromEnv(base).exitWhenIdle).toBe(false);
		expect(
			hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" })
				.exitWhenIdle,
		).toBe(true);
		expect(
			hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "false" })
				.exitWhenIdle,
		).toBe(false);
		for (const value of ["1", "yes", "TRUE", ""]) {
			expect(() =>
				hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_WORKER_EXIT_WHEN_IDLE: value }),
			).toThrow("TYPELAPSE_WORKER_EXIT_WHEN_IDLE must be true or false");
		}
	});
});
