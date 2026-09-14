import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import {
	HostedRenderProcessingError,
	createHostedRenderProcessor,
	type HostedMultimediaRendererPort,
	type HostedRenderHeartbeatSchedulerPort,
	type HostedRenderProcessor,
} from "../../src/application/render/process-hosted-render-job";
import {
	createHostedRenderWorker,
	type HostedRenderWorker,
	type RenderJobQueuePort,
} from "../../src/application/render/hosted-render-worker";
import { createAssetRepository } from "../db/asset.repository";
import { databaseFromEnv, type CreatorDatabase } from "../db/database";
import { createRenderJobQueue } from "../db/render-job.repository";
import {
	createHostedRemotionV2Renderer,
	type HostedRenderAssetMaterializerPort,
} from "../render/v2/remotion-v2-renderer";
import {
	hostedRenderObjectStorageFromEnv,
	type HostedRenderObjectStorage,
} from "../storage/hosted-render-object-storage";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
type AbortableSleep = (delayMs: number, signal: AbortSignal) => Promise<void>;

export interface HostedRenderRuntimeConfig {
	readonly compilerVersion: string;
	readonly leaseDurationMs: number;
	readonly heartbeatIntervalMs: number;
	readonly maxAttempts: number;
	readonly retryBaseDelayMs: number;
	readonly retryMaxDelayMs: number;
	readonly idleMinDelayMs: number;
	readonly idleMaxDelayMs: number;
	readonly failureDelayMs: number;
	readonly renderTimeoutMs: number;
	readonly temporaryRoot?: string;
}

export interface HostedRenderRuntimeLogger {
	info(message: string): void;
	error(message: string): void;
}

export interface HostedRenderRuntime {
	run(signal: AbortSignal): Promise<void>;
}

const DEFAULT_CONFIG = {
	leaseDurationMs: 120_000,
	heartbeatIntervalMs: 15_000,
	maxAttempts: 3,
	retryBaseDelayMs: 5_000,
	retryMaxDelayMs: 60_000,
	idleMinDelayMs: 250,
	idleMaxDelayMs: 5_000,
	failureDelayMs: 5_000,
	renderTimeoutMs: 15 * 60_000,
} as const;

function boundedInteger(
	environment: RuntimeEnvironment,
	key: string,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const raw = environment[key];
	if (raw === undefined) {
		return fallback;
	}
	if (!/^\d+$/.test(raw)) {
		throw new Error(`${key} must be an integer`);
	}
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${key} is outside the supported range`);
	}
	return value;
}

function requiredCompilerVersion(environment: RuntimeEnvironment): string {
	const version = environment.TYPELAPSE_COMPILER_VERSION?.trim();
	if (!version || version.length > 128 || !/^[A-Za-z0-9._:+-]+$/.test(version)) {
		throw new Error("TYPELAPSE_COMPILER_VERSION is required and must be a safe identifier");
	}
	return version;
}

export function hostedRenderRuntimeConfigFromEnv(
	environment: RuntimeEnvironment,
): HostedRenderRuntimeConfig {
	const config: HostedRenderRuntimeConfig = {
		compilerVersion: requiredCompilerVersion(environment),
		leaseDurationMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_LEASE_MS",
			DEFAULT_CONFIG.leaseDurationMs,
			30_000,
			30 * 60_000,
		),
		heartbeatIntervalMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_HEARTBEAT_MS",
			DEFAULT_CONFIG.heartbeatIntervalMs,
			1_000,
			5 * 60_000,
		),
		maxAttempts: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_MAX_ATTEMPTS",
			DEFAULT_CONFIG.maxAttempts,
			1,
			10,
		),
		retryBaseDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_RETRY_BASE_MS",
			DEFAULT_CONFIG.retryBaseDelayMs,
			100,
			5 * 60_000,
		),
		retryMaxDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_RETRY_MAX_MS",
			DEFAULT_CONFIG.retryMaxDelayMs,
			100,
			30 * 60_000,
		),
		idleMinDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_IDLE_MIN_MS",
			DEFAULT_CONFIG.idleMinDelayMs,
			25,
			60_000,
		),
		idleMaxDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_IDLE_MAX_MS",
			DEFAULT_CONFIG.idleMaxDelayMs,
			25,
			60_000,
		),
		failureDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_FAILURE_MS",
			DEFAULT_CONFIG.failureDelayMs,
			100,
			60_000,
		),
		renderTimeoutMs: boundedInteger(
			environment,
			"TYPELAPSE_RENDER_TIMEOUT_MS",
			DEFAULT_CONFIG.renderTimeoutMs,
			30_000,
			2 * 60 * 60_000,
		),
		...(environment.TYPELAPSE_RENDER_TEMP_ROOT?.trim()
			? { temporaryRoot: environment.TYPELAPSE_RENDER_TEMP_ROOT.trim() }
			: {}),
	};
	if (config.heartbeatIntervalMs >= config.leaseDurationMs) {
		throw new Error("Hosted render heartbeat must be shorter than its lease");
	}
	if (config.idleMaxDelayMs < config.idleMinDelayMs) {
		throw new Error("Hosted render idle maximum must cover the idle minimum");
	}
	if (config.retryMaxDelayMs < config.retryBaseDelayMs) {
		throw new Error("Hosted render retry maximum must cover its base delay");
	}
	return config;
}

export function sleepUntilDelayOrAbort(
	delayMs: number,
	signal: AbortSignal,
): Promise<void> {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, delayMs);
		signal.addEventListener("abort", finish, { once: true });
	});
}

export function createHostedRenderHeartbeatScheduler(): HostedRenderHeartbeatSchedulerPort {
	return {
		start(input) {
			let stopped = false;
			let timer: ReturnType<typeof setTimeout> | null = null;
			let inFlight = Promise.resolve();
			const clear = () => {
				stopped = true;
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
			};
			const schedule = () => {
				if (stopped || input.signal.aborted) {
					clear();
					return;
				}
				timer = setTimeout(() => {
					timer = null;
					inFlight = input
						.heartbeat()
						.catch(() => undefined)
						.then(schedule);
				}, input.intervalMs);
			};
			input.signal.addEventListener("abort", clear, { once: true });
			schedule();
			return {
				async stop() {
					clear();
					input.signal.removeEventListener("abort", clear);
					await inFlight;
				},
			};
		},
	};
}

export async function runHostedRenderLoop(input: {
	readonly processor: HostedRenderProcessor;
	readonly workerId: string;
	readonly signal: AbortSignal;
	readonly idleMinDelayMs: number;
	readonly idleMaxDelayMs: number;
	readonly failureDelayMs: number;
	readonly renderTimeoutMs?: number;
	readonly sleep?: AbortableSleep;
	readonly logger?: HostedRenderRuntimeLogger;
}): Promise<void> {
	const sleep = input.sleep ?? sleepUntilDelayOrAbort;
	const logger = input.logger ?? console;
	const renderTimeoutMs = input.renderTimeoutMs ?? DEFAULT_CONFIG.renderTimeoutMs;
	let idleDelayMs = input.idleMinDelayMs;
	while (!input.signal.aborted) {
		const attemptController = new AbortController();
		const abortAttempt = () => attemptController.abort(input.signal.reason);
		input.signal.addEventListener("abort", abortAttempt, { once: true });
		const timeout = setTimeout(
			() => attemptController.abort(new Error("Hosted render attempt timed out")),
			renderTimeoutMs,
		);
		try {
			const result = await input.processor.runOnce(input.workerId, {
				signal: attemptController.signal,
			});
			if (result === "aborted") {
				if (input.signal.aborted) {
					return;
				}
				logger.error("Hosted render worker attempt timed out");
				await sleep(input.failureDelayMs, input.signal);
				continue;
			}
			if (result === "idle") {
				await sleep(idleDelayMs, input.signal);
				idleDelayMs = Math.min(input.idleMaxDelayMs, idleDelayMs * 2);
				continue;
			}
			idleDelayMs = input.idleMinDelayMs;
			if (result === "lease-lost") {
				await sleep(input.idleMinDelayMs, input.signal);
			}
		} catch {
			logger.error("Hosted render worker iteration failed");
			idleDelayMs = input.idleMinDelayMs;
			await sleep(input.failureDelayMs, input.signal);
		} finally {
			clearTimeout(timeout);
			input.signal.removeEventListener("abort", abortAttempt);
		}
	}
}

function workerIdFromEnvironment(environment: RuntimeEnvironment, fallback?: string): string {
	const workerId = environment.TYPELAPSE_RENDER_WORKER_ID?.trim() || fallback;
	if (!workerId || workerId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(workerId)) {
		throw new Error("Hosted render worker id is invalid");
	}
	return workerId;
}

export function bindRendererCompilerVersion(
	renderer: HostedMultimediaRendererPort,
	compilerVersion: string,
): HostedMultimediaRendererPort {
	return {
		async render(input) {
			if (input.compilerVersion !== compilerVersion) {
				throw new HostedRenderProcessingError(
					"compiler-version-mismatch",
					"The render job targets a different compiler version",
					{ retryable: false },
				);
			}
			return renderer.render(input);
		},
		cleanup: (artifact) => renderer.cleanup(artifact),
	};
}

interface HostedRenderWorkerFactoryInput {
	readonly queue: RenderJobQueuePort;
	readonly leaseDurationMs: number;
	readonly maxAttempts: number;
	readonly retryDelayMs: (attempt: number) => number;
}

interface HostedRenderProcessorFactoryInput {
	readonly worker: HostedRenderWorker;
	readonly renderer: HostedMultimediaRendererPort;
	readonly outputs: HostedRenderObjectStorage;
	readonly heartbeats: HostedRenderHeartbeatSchedulerPort;
	readonly heartbeatIntervalMs: number;
}

export function createHostedRenderRuntimeFromEnv(input: {
	readonly environment?: RuntimeEnvironment;
	readonly workerId?: string;
	readonly sleep?: AbortableSleep;
	readonly logger?: HostedRenderRuntimeLogger;
	readonly databaseFactory?: (environment: RuntimeEnvironment) => CreatorDatabase | null;
	readonly assetRepositoryFactory?: (database: CreatorDatabase) => AssetRepositoryPort;
	readonly storageFactory?: (input: {
		readonly assets: AssetRepositoryPort;
		readonly environment: RuntimeEnvironment;
	}) => HostedRenderObjectStorage | null;
	readonly queueFactory?: (database: CreatorDatabase) => RenderJobQueuePort;
	readonly workerFactory?: (input: HostedRenderWorkerFactoryInput) => HostedRenderWorker;
	readonly rendererFactory?: (input: {
		readonly assets: HostedRenderAssetMaterializerPort;
		readonly temporaryRoot?: string;
	}) => HostedMultimediaRendererPort;
	readonly processorFactory?: (input: HostedRenderProcessorFactoryInput) => HostedRenderProcessor;
	readonly heartbeatFactory?: () => HostedRenderHeartbeatSchedulerPort;
} = {}): HostedRenderRuntime {
	const environment = input.environment ?? process.env;
	const config = hostedRenderRuntimeConfigFromEnv(environment);
	const databaseFactory = input.databaseFactory ?? databaseFromEnv;
	let database: CreatorDatabase | null;
	try {
		database = databaseFactory(environment);
	} catch {
		throw new Error("Hosted render worker database configuration is invalid");
	}
	if (!database) {
		throw new Error("Database configuration is required for hosted render worker");
	}

	const assets = (input.assetRepositoryFactory ?? createAssetRepository)(database);
	let storage: HostedRenderObjectStorage | null;
	try {
		storage = (input.storageFactory ?? hostedRenderObjectStorageFromEnv)({
			assets,
			environment,
		});
	} catch {
		throw new Error("Hosted render worker object storage configuration is invalid");
	}
	if (!storage) {
		throw new Error("Object storage configuration is required for hosted render worker");
	}

	const queue = (input.queueFactory ?? createRenderJobQueue)(database);
	const retryDelayMs = (attempt: number) =>
		Math.min(config.retryMaxDelayMs, config.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
	const worker = (input.workerFactory ?? createHostedRenderWorker)({
		queue,
		leaseDurationMs: config.leaseDurationMs,
		maxAttempts: config.maxAttempts,
		retryDelayMs,
	});
	const renderer = bindRendererCompilerVersion(
		(input.rendererFactory ?? createHostedRemotionV2Renderer)({
			assets: storage,
			...(config.temporaryRoot ? { temporaryRoot: config.temporaryRoot } : {}),
		}),
		config.compilerVersion,
	);
	const processor = (input.processorFactory ?? createHostedRenderProcessor)({
		worker,
		renderer,
		outputs: storage,
		heartbeats: (input.heartbeatFactory ?? createHostedRenderHeartbeatScheduler)(),
		heartbeatIntervalMs: config.heartbeatIntervalMs,
	});
	const workerId = workerIdFromEnvironment(
		environment,
		input.workerId ?? `hosted-render-${process.pid}`,
	);

	return {
		run: (signal) =>
			runHostedRenderLoop({
				processor,
				workerId,
				signal,
				idleMinDelayMs: config.idleMinDelayMs,
				idleMaxDelayMs: config.idleMaxDelayMs,
				failureDelayMs: config.failureDelayMs,
				renderTimeoutMs: config.renderTimeoutMs,
				...(input.sleep ? { sleep: input.sleep } : {}),
				...(input.logger ? { logger: input.logger } : {}),
			}),
	};
}
