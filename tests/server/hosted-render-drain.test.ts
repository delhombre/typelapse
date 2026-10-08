// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import type { HostedMultimediaRendererPort } from "../../src/application/render/process-hosted-render-job";
import type {
	RenderJobLease,
	RenderJobQueuePort,
} from "../../src/application/render/hosted-render-worker";
import type { HostedRenderObjectStorage } from "../../server/storage/hosted-render-object-storage";
import { launchHostedRenderWorker } from "../../server/workers/hosted-render.entrypoint";
import {
	createHostedRenderRuntimeFromEnv,
	hostedRenderRuntimeConfigFromEnv,
} from "../../server/workers/hosted-render-runtime";
import {
	closableDatabase,
	recordingSleep,
	type ScriptedClaim,
	scriptedClaims,
	ShutdownSignals,
} from "./support/worker-harness";

/**
 * The render worker runs as a scheduled job that drains the queue: with
 * TYPELAPSE_WORKER_EXIT_WHEN_IDLE it renders what it can claim and exits 0 the
 * first time a claim comes back empty. These go through the real runtime,
 * worker and processor; only the queue, the renderer, the storage and the
 * database pool are fakes.
 */

const COMPILER_VERSION = "compiler-v2";
const DRAIN = { TYPELAPSE_WORKER_EXIT_WHEN_IDLE: "true" } as const;
const DOCUMENT = migrateV1ToV2({
	title: "Drain",
	code: "const drained = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const drained = true;", duration: 1000 }],
});

function renderWorker(input: {
	readonly claims: ReadonlyArray<ScriptedClaim>;
	readonly environment: Readonly<Record<string, string>>;
	/** SIGTERM after this many sleeps (once by default). */
	readonly stopAfterSleeps?: number;
	/** The render only ends when the worker aborts it, as SIGTERM does. */
	readonly renderUntilAborted?: boolean;
}) {
	const signals = new ShutdownSignals();
	const { database, pool } = closableDatabase();
	const { sleeps, sleep } = recordingSleep(signals, input.stopAfterSleeps);
	const script = scriptedClaims(input.claims, (index) => `job-${index}`);
	const succeeded: string[] = [];
	const renders: string[] = [];
	const errors: string[] = [];
	const queue: RenderJobQueuePort = {
		async claim(claim) {
			const id = script.next();
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
				workerId: claim.workerId,
				expiresAt: claim.leaseExpiresAt,
			};
			return lease;
		},
		heartbeat: async () => true,
		async succeed(command) {
			succeeded.push(command.jobId);
			return true;
		},
		fail: async () => true,
	};
	const renderer: HostedMultimediaRendererPort = {
		async render(job) {
			renders.push(job.jobId);
			if (input.renderUntilAborted) {
				await new Promise<void>((resolve) =>
					job.signal.addEventListener("abort", () => resolve(), { once: true }),
				);
				throw new Error("Render aborted");
			}
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
	const logger = { info: () => undefined, error: (message: string) => errors.push(message) };

	const launch = () =>
		launchHostedRenderWorker({
			signals,
			logger,
			createRuntime: () =>
				createHostedRenderRuntimeFromEnv({
					environment: { TYPELAPSE_COMPILER_VERSION: COMPILER_VERSION, ...input.environment },
					workerId: "render-worker-a",
					logger,
					databaseFactory: () => database,
					assetRepositoryFactory: () => ({}) as AssetRepositoryPort,
					storageFactory: () => storage,
					queueFactory: () => queue,
					rendererFactory: () => renderer,
					sleep,
				}),
		});
	return { launch, signals, claims: script.claims, renders, succeeded, sleeps, pool, errors };
}

describe("draining the render queue, for scheduled jobs", () => {
	it("exits 0 without sleeping when the queue is empty, and closes the pool", async () => {
		const worker = renderWorker({ claims: [], environment: DRAIN });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null]);
		expect(worker.renders).toEqual([]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
	});

	it("renders the three claimable jobs, then exits 0", async () => {
		const worker = renderWorker({ claims: ["item", "item", "item"], environment: DRAIN });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.renders).toEqual(["job-1", "job-2", "job-3"]);
		expect(worker.succeeded).toEqual(["job-1", "job-2", "job-3"]);
		expect(worker.claims).toEqual(["item-1", "item-2", "item-3", null]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
	});

	it("keeps polling an empty queue when the variable is unset", async () => {
		const worker = renderWorker({ claims: [], environment: {}, stopAfterSleeps: 3 });

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual([null, null, null]);
		expect(worker.sleeps).toEqual([250, 500, 1_000]);
		expect(worker.pool.closed).toBe(1);
	});

	it("waits the failure delay after a claim that throws, then carries on draining", async () => {
		const worker = renderWorker({
			claims: ["throws", "item", "throws", "throws"],
			environment: DRAIN,
			stopAfterSleeps: 4,
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual(["throws", "item-1", "throws", "throws", null]);
		expect(worker.renders).toEqual(["job-1"]);
		expect(worker.sleeps).toEqual([5_000, 5_000, 5_000]);
		expect(worker.errors.join(" ")).not.toContain("secret");
	});

	it("exits 1 after three failed iterations in a row, and closes the pool", async () => {
		const worker = renderWorker({
			claims: ["throws", "throws", "throws", "item"],
			environment: DRAIN,
			stopAfterSleeps: 3,
		});

		await expect(worker.launch()).resolves.toBe(1);

		expect(worker.claims).toEqual(["throws", "throws", "throws"]);
		expect(worker.sleeps).toEqual([5_000, 5_000]);
		expect(worker.errors).toContain(
			"Hosted render worker stopped after 3 failed iterations in a row",
		);
		expect(worker.errors.join(" ")).not.toContain("secret");
		expect(worker.pool.closed).toBe(1);
	});

	it("keeps retrying failures without that limit when the variable is unset", async () => {
		const worker = renderWorker({
			claims: ["throws", "throws", "throws", "throws"],
			environment: {},
			stopAfterSleeps: 4,
		});

		await expect(worker.launch()).resolves.toBe(0);

		expect(worker.claims).toEqual(["throws", "throws", "throws", "throws"]);
		expect(worker.sleeps).toEqual([5_000, 5_000, 5_000, 5_000]);
	});

	it("aborts the render in progress on SIGTERM and exits 0 without claiming again", async () => {
		const worker = renderWorker({
			claims: ["item", "item"],
			environment: DRAIN,
			renderUntilAborted: true,
		});

		const running = worker.launch();
		await vi.waitFor(() => expect(worker.renders).toEqual(["job-1"]));
		worker.signals.emit("SIGTERM");

		await expect(running).resolves.toBe(0);
		expect(worker.claims).toEqual(["item-1"]);
		expect(worker.succeeded).toEqual([]);
		expect(worker.sleeps).toEqual([]);
		expect(worker.pool.closed).toBe(1);
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

