import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	createObjectDeletionRuntimeFromEnv,
	type ObjectDeletionRuntime,
	type ObjectDeletionRuntimeLogger,
} from "./object-deletion-runtime";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface ShutdownSignalSource {
	once(signal: ShutdownSignal, listener: () => void): unknown;
	off(signal: ShutdownSignal, listener: () => void): unknown;
}

interface ObjectDeletionEntrypointOptions {
	readonly environment?: Readonly<Record<string, string | undefined>>;
	readonly signals?: ShutdownSignalSource;
	readonly logger?: ObjectDeletionRuntimeLogger;
	readonly createRuntime?: () => ObjectDeletionRuntime;
}

export async function runObjectDeletionEntrypoint(
	input: ObjectDeletionEntrypointOptions = {},
): Promise<void> {
	const signals = input.signals ?? process;
	const logger = input.logger ?? console;
	const controller = new AbortController();
	const stop = () => controller.abort();
	signals.once("SIGTERM", stop);
	signals.once("SIGINT", stop);
	let started = false;

	try {
		const runtime = input.createRuntime
			? input.createRuntime()
			: createObjectDeletionRuntimeFromEnv({
					environment: input.environment ?? process.env,
					logger,
				});
		started = true;
		logger.info("Object deletion worker started");
		await runtime.run(controller.signal);
	} finally {
		signals.off("SIGTERM", stop);
		signals.off("SIGINT", stop);
		if (started) {
			logger.info("Object deletion worker stopped");
		}
	}
}

export async function launchObjectDeletionWorker(
	input: ObjectDeletionEntrypointOptions = {},
): Promise<0 | 1> {
	const logger = input.logger ?? console;
	try {
		await runObjectDeletionEntrypoint({ ...input, logger });
		return 0;
	} catch {
		logger.error("Object deletion worker failed");
		return 1;
	}
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
	void launchObjectDeletionWorker().then((exitCode) => {
		process.exitCode = exitCode;
	});
}
