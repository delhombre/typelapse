import type { ObjectDeletePort } from "../../src/application/assets/object-delete.port";
import {
	createObjectDeletionWorker,
	type ObjectDeletionQueuePort,
	type ObjectDeletionRunResult,
	type ObjectDeletionWorker,
} from "../../src/application/assets/object-deletion-worker";
import { databaseFromEnv, type CreatorDatabase } from "../db/database";
import { createObjectDeletionQueue } from "../db/object-deletion-outbox.repository";
import { r2ObjectStorageFromEnv } from "../storage/r2-object-storage";
import { DRAIN_FAILURE_LIMIT, exitWhenIdleFrom } from "./exit-when-idle";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface ObjectDeletionRuntimeConfig {
	readonly leaseDurationMs: number;
	readonly idleMinDelayMs: number;
	readonly idleMaxDelayMs: number;
	readonly failureDelayMs: number;
	/** Drain mode: exit when a claim finds nothing, instead of polling again. */
	readonly exitWhenIdle: boolean;
}

export interface ObjectDeletionRuntimeLogger {
	info(message: string): void;
	error(message: string): void;
}

export interface ObjectDeletionRuntime {
	run(signal: AbortSignal): Promise<void>;
}

type AbortableSleep = (delayMs: number, signal: AbortSignal) => Promise<void>;

const DEFAULT_CONFIG: ObjectDeletionRuntimeConfig = {
	leaseDurationMs: 30_000,
	idleMinDelayMs: 250,
	idleMaxDelayMs: 5_000,
	failureDelayMs: 5_000,
	exitWhenIdle: false,
};

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

export function objectDeletionRuntimeConfigFromEnv(
	environment: RuntimeEnvironment,
): ObjectDeletionRuntimeConfig {
	const config = {
		leaseDurationMs: boundedInteger(
			environment,
			"TYPELAPSE_OBJECT_DELETION_LEASE_MS",
			DEFAULT_CONFIG.leaseDurationMs,
			5_000,
			5 * 60_000,
		),
		idleMinDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_OBJECT_DELETION_IDLE_MIN_MS",
			DEFAULT_CONFIG.idleMinDelayMs,
			25,
			60_000,
		),
		idleMaxDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_OBJECT_DELETION_IDLE_MAX_MS",
			DEFAULT_CONFIG.idleMaxDelayMs,
			25,
			60_000,
		),
		failureDelayMs: boundedInteger(
			environment,
			"TYPELAPSE_OBJECT_DELETION_FAILURE_MS",
			DEFAULT_CONFIG.failureDelayMs,
			100,
			60_000,
		),
		exitWhenIdle: exitWhenIdleFrom(environment),
	};
	if (config.idleMaxDelayMs < config.idleMinDelayMs) {
		throw new Error("Object deletion idle maximum must cover the idle minimum");
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

export async function runObjectDeletionLoop(input: {
	readonly worker: ObjectDeletionWorker;
	readonly workerId: string;
	readonly signal: AbortSignal;
	readonly idleMinDelayMs: number;
	readonly idleMaxDelayMs: number;
	readonly failureDelayMs: number;
	/** Return the first time a claim finds nothing, instead of sleeping. */
	readonly exitWhenIdle?: boolean;
	readonly sleep?: AbortableSleep;
	readonly logger?: ObjectDeletionRuntimeLogger;
}): Promise<void> {
	const sleep = input.sleep ?? sleepUntilDelayOrAbort;
	const logger = input.logger ?? console;
	let idleDelayMs = input.idleMinDelayMs;
	let failuresInARow = 0;

	while (!input.signal.aborted) {
		let result: ObjectDeletionRunResult;
		try {
			result = await input.worker.runOnce(input.workerId);
		} catch {
			logger.error("Object deletion worker iteration failed");
			failuresInARow += 1;
			if (input.exitWhenIdle && failuresInARow >= DRAIN_FAILURE_LIMIT) {
				const message = `Object deletion worker stopped after ${DRAIN_FAILURE_LIMIT} failed iterations in a row`;
				logger.error(message);
				throw new Error(message);
			}
			idleDelayMs = input.idleMinDelayMs;
			await sleep(input.failureDelayMs, input.signal);
			continue;
		}
		failuresInARow = 0;
		if (result === "idle") {
			if (input.exitWhenIdle) {
				return;
			}
			await sleep(idleDelayMs, input.signal);
			idleDelayMs = Math.min(input.idleMaxDelayMs, idleDelayMs * 2);
			continue;
		}
		idleDelayMs = input.idleMinDelayMs;
		if (result === "lease-lost") {
			await sleep(input.idleMinDelayMs, input.signal);
		}
	}
}

function workerIdFromEnvironment(environment: RuntimeEnvironment, fallback?: string): string {
	const workerId = environment.TYPELAPSE_OBJECT_DELETION_WORKER_ID?.trim() || fallback;
	if (!workerId || workerId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(workerId)) {
		throw new Error("Object deletion worker id is invalid");
	}
	return workerId;
}

interface ObjectDeletionWorkerFactoryInput {
	readonly queue: ObjectDeletionQueuePort;
	readonly objects: ObjectDeletePort;
	readonly leaseDurationMs: number;
	readonly now?: () => Date;
}

export function createObjectDeletionRuntimeFromEnv(input: {
	readonly environment?: RuntimeEnvironment;
	readonly workerId?: string;
	readonly now?: () => Date;
	readonly sleep?: AbortableSleep;
	readonly logger?: ObjectDeletionRuntimeLogger;
	readonly databaseFactory?: (environment: RuntimeEnvironment) => CreatorDatabase | null;
	readonly storageFactory?: (environment: RuntimeEnvironment) => ObjectDeletePort | null;
	readonly queueFactory?: (database: CreatorDatabase) => ObjectDeletionQueuePort;
	readonly workerFactory?: (input: ObjectDeletionWorkerFactoryInput) => ObjectDeletionWorker;
} = {}): ObjectDeletionRuntime {
	const environment = input.environment ?? process.env;
	const config = objectDeletionRuntimeConfigFromEnv(environment);
	const databaseFactory = input.databaseFactory ?? databaseFromEnv;
	const storageFactory = input.storageFactory ?? r2ObjectStorageFromEnv;
	const queueFactory = input.queueFactory ?? createObjectDeletionQueue;
	const workerFactory = input.workerFactory ?? createObjectDeletionWorker;

	let database: CreatorDatabase | null;
	try {
		database = databaseFactory(environment);
	} catch {
		throw new Error("Object deletion worker database configuration is invalid");
	}
	if (!database) {
		throw new Error("Database configuration is required for object deletion worker");
	}

	let objects: ObjectDeletePort | null;
	try {
		objects = storageFactory(environment);
	} catch {
		throw new Error("Object deletion worker object storage configuration is invalid");
	}
	if (!objects) {
		throw new Error("Object storage configuration is required for object deletion worker");
	}

	const workerId = workerIdFromEnvironment(
		environment,
		input.workerId ?? `object-deletion-${process.pid}`,
	);
	const queue = queueFactory(database);
	const worker = workerFactory({
		queue,
		objects,
		leaseDurationMs: config.leaseDurationMs,
		...(input.now ? { now: input.now } : {}),
	});

	const pool = database.$client;

	return {
		async run(signal) {
			try {
				await runObjectDeletionLoop({
					worker,
					workerId,
					signal,
					idleMinDelayMs: config.idleMinDelayMs,
					idleMaxDelayMs: config.idleMaxDelayMs,
					failureDelayMs: config.failureDelayMs,
					exitWhenIdle: config.exitWhenIdle,
					...(input.sleep ? { sleep: input.sleep } : {}),
					...(input.logger ? { logger: input.logger } : {}),
				});
			} finally {
				// An open pool keeps the process alive for its idle timeout (10 s).
				await pool.end();
			}
		},
	};
}
