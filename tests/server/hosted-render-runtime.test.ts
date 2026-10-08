import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type HostedRenderProcessor,
	type HostedRenderHeartbeatSchedulerPort,
	type HostedMultimediaRendererPort,
} from "../../src/application/render/process-hosted-render-job";
import {
	bindRendererCompilerVersion,
	createHostedRenderHeartbeatScheduler,
	createHostedRenderRuntimeFromEnv,
	hostedRenderRuntimeConfigFromEnv,
	runHostedRenderLoop,
} from "../../server/workers/hosted-render-runtime";
import type { CreatorDatabase } from "../../server/db/database";

afterEach(() => {
	vi.useRealTimers();
});

describe("hosted render runtime config", () => {
	it("parses bounded operational controls and requires a compiler identity", () => {
		expect(
			hostedRenderRuntimeConfigFromEnv({
				TYPELAPSE_COMPILER_VERSION: "compiler-v2",
				TYPELAPSE_RENDER_LEASE_MS: "180000",
				TYPELAPSE_RENDER_HEARTBEAT_MS: "15000",
				TYPELAPSE_RENDER_MAX_ATTEMPTS: "4",
				TYPELAPSE_RENDER_TIMEOUT_MS: "900000",
			}),
		).toMatchObject({
			compilerVersion: "compiler-v2",
			leaseDurationMs: 180_000,
			heartbeatIntervalMs: 15_000,
			maxAttempts: 4,
			renderTimeoutMs: 900_000,
		});
	});

	it("reads the render concurrency from 1 to 16, and leaves it unset when the variable is unset or blank", () => {
		const base = { TYPELAPSE_COMPILER_VERSION: "compiler-v2" };

		expect(
			hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_RENDER_CONCURRENCY: "2" }),
		).toMatchObject({ concurrency: 2 });
		expect(
			hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_RENDER_CONCURRENCY: " 16 " }),
		).toMatchObject({ concurrency: 16 });
		expect(hostedRenderRuntimeConfigFromEnv(base)).not.toHaveProperty("concurrency");
		expect(
			hostedRenderRuntimeConfigFromEnv({ ...base, TYPELAPSE_RENDER_CONCURRENCY: " " }),
		).not.toHaveProperty("concurrency");
	});

	it.each(["0", "17", "-1", "1.5", "two"])("refuses a render concurrency of %s, naming the variable", (value) => {
		expect(() =>
			hostedRenderRuntimeConfigFromEnv({
				TYPELAPSE_COMPILER_VERSION: "compiler-v2",
				TYPELAPSE_RENDER_CONCURRENCY: value,
			}),
		).toThrow("TYPELAPSE_RENDER_CONCURRENCY");
	});

	it.each([
		[{}, "TYPELAPSE_COMPILER_VERSION is required"],
		[
			{ TYPELAPSE_COMPILER_VERSION: "compiler-v2", TYPELAPSE_RENDER_CONCURRENCY: "0" },
			"TYPELAPSE_RENDER_CONCURRENCY",
		],
		[
			{ TYPELAPSE_COMPILER_VERSION: "compiler-v2", TYPELAPSE_RENDER_HEARTBEAT_MS: "120000" },
			"heartbeat must be shorter",
		],
		[
			{ TYPELAPSE_COMPILER_VERSION: "compiler-v2", TYPELAPSE_RENDER_MAX_ATTEMPTS: "0" },
			"outside the supported range",
		],
	])("rejects unsafe config %#", (environment, message) => {
		expect(() => hostedRenderRuntimeConfigFromEnv(environment)).toThrow(message);
	});
});

describe("hosted render loop", () => {
	it("backs off while idle, resets after work and exits on shutdown", async () => {
		const controller = new AbortController();
		const results = ["idle", "idle", "succeeded"] as const;
		const calls: string[] = [];
		const delays: number[] = [];
		const processor: HostedRenderProcessor = {
			runOnce: async (workerId) => {
				calls.push(workerId);
				return results[calls.length - 1] ?? "idle";
			},
		};

		await runHostedRenderLoop({
			processor,
			workerId: "render-worker-a",
			signal: controller.signal,
			idleMinDelayMs: 25,
			idleMaxDelayMs: 100,
			failureDelayMs: 200,
			renderTimeoutMs: 60_000,
			sleep: async (delay) => {
				delays.push(delay);
				if (calls.length === 4) {
					controller.abort();
				}
			},
		});

		expect(calls).toEqual([
			"render-worker-a",
			"render-worker-a",
			"render-worker-a",
			"render-worker-a",
		]);
		expect(delays).toEqual([25, 50, 25]);
	});

	it("logs only a generic failure and retries after the failure delay", async () => {
		const controller = new AbortController();
		const errors: string[] = [];
		const sleeps: number[] = [];
		const processor: HostedRenderProcessor = {
			runOnce: async () => {
				throw new Error("R2_SECRET_ACCESS_KEY=never-log-this");
			},
		};

		await runHostedRenderLoop({
			processor,
			workerId: "render-worker-a",
			signal: controller.signal,
			idleMinDelayMs: 25,
			idleMaxDelayMs: 100,
			failureDelayMs: 200,
			renderTimeoutMs: 60_000,
			logger: { info: () => undefined, error: (message) => errors.push(message) },
			sleep: async (delay) => {
				sleeps.push(delay);
				controller.abort();
			},
		});

		expect(errors).toEqual(["Hosted render worker iteration failed"]);
		expect(errors.join(" ")).not.toContain("never-log-this");
		expect(sleeps).toEqual([200]);
	});

	it("bounds a render attempt without treating its timeout as process shutdown", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const errors: string[] = [];
		let attempts = 0;
		const processor: HostedRenderProcessor = {
			runOnce: async (_workerId, options) => {
				attempts += 1;
				return await new Promise<"aborted">((resolve) => {
					options?.signal?.addEventListener("abort", () => resolve("aborted"), { once: true });
				});
			},
		};
		const running = runHostedRenderLoop({
			processor,
			workerId: "render-worker-a",
			signal: controller.signal,
			idleMinDelayMs: 25,
			idleMaxDelayMs: 100,
			failureDelayMs: 200,
			renderTimeoutMs: 1_000,
			logger: { info: () => undefined, error: (message) => errors.push(message) },
			sleep: async () => controller.abort(),
		});

		await vi.advanceTimersByTimeAsync(1_000);
		await running;

		expect(attempts).toBe(1);
		expect(errors).toEqual(["Hosted render worker attempt timed out"]);
	});
});

describe("hosted render runtime composition", () => {
	it("fails closed without both durable persistence and private object storage", () => {
		const environment = { TYPELAPSE_COMPILER_VERSION: "compiler-v2" };

		expect(() =>
			createHostedRenderRuntimeFromEnv({
				environment,
				databaseFactory: () => null,
			}),
		).toThrow("Database configuration is required for hosted render worker");
		expect(() =>
			createHostedRenderRuntimeFromEnv({
				environment,
				databaseFactory: () => ({}) as CreatorDatabase,
				storageFactory: () => null,
			}),
		).toThrow("Object storage configuration is required for hosted render worker");
	});

	it("binds a renderer to the durable job compiler version", async () => {
		let called = false;
		const renderer: HostedMultimediaRendererPort = {
			render: async () => {
				called = true;
				return { temporaryId: "/tmp/output.mp4", mimeType: "video/mp4", byteSize: 1 };
			},
			cleanup: async () => undefined,
		};
		const bound = bindRendererCompilerVersion(renderer, "compiler-v2");

		await expect(
			bound.render({
				jobId: "job-1",
				ownerId: "owner-1",
				projectId: "project-1",
				revision: 1,
				document: {} as never,
				options: { format: "mp4", width: 1920, height: 1080, fps: 30, includeAudio: false },
				compilerVersion: "compiler-v1",
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({ code: "compiler-version-mismatch", retryable: false });
		expect(called).toBe(false);
	});

	it("schedules non-overlapping heartbeats and stops cleanly", async () => {
		vi.useFakeTimers();
		let active = 0;
		let maximumActive = 0;
		let calls = 0;
		const scheduler: HostedRenderHeartbeatSchedulerPort =
			createHostedRenderHeartbeatScheduler();
		const handle = scheduler.start({
			intervalMs: 100,
			signal: new AbortController().signal,
			heartbeat: async () => {
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				calls += 1;
				await new Promise((resolve) => setTimeout(resolve, 150));
				active -= 1;
			},
		});

		await vi.advanceTimersByTimeAsync(500);
		await handle.stop();

		expect(calls).toBeGreaterThanOrEqual(2);
		expect(maximumActive).toBe(1);
	});
});
