import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	createHostedRenderRuntimeFromEnv,
	type HostedRenderRuntime,
	type HostedRenderRuntimeLogger,
} from "./hosted-render-runtime";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface ShutdownSignalSource {
	once(signal: ShutdownSignal, listener: () => void): unknown;
	off(signal: ShutdownSignal, listener: () => void): unknown;
}

interface HostedRenderEntrypointOptions {
	readonly environment?: Readonly<Record<string, string | undefined>>;
	readonly signals?: ShutdownSignalSource;
	readonly logger?: HostedRenderRuntimeLogger;
	readonly createRuntime?: () => HostedRenderRuntime;
}

export async function runHostedRenderEntrypoint(
	input: HostedRenderEntrypointOptions = {},
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
			: createHostedRenderRuntimeFromEnv({
					environment: input.environment ?? process.env,
					logger,
				});
		started = true;
		logger.info("Hosted render worker started");
		await runtime.run(controller.signal);
	} finally {
		signals.off("SIGTERM", stop);
		signals.off("SIGINT", stop);
		if (started) {
			logger.info("Hosted render worker stopped");
		}
	}
}

export async function launchHostedRenderWorker(
	input: HostedRenderEntrypointOptions = {},
): Promise<0 | 1> {
	const logger = input.logger ?? console;
	try {
		await runHostedRenderEntrypoint({ ...input, logger });
		return 0;
	} catch {
		logger.error("Hosted render worker failed");
		return 1;
	}
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
	void launchHostedRenderWorker().then((exitCode) => {
		process.exitCode = exitCode;
	});
}
