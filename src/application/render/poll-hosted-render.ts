import type {
	HostedRenderClientDownload,
	HostedRenderClientPort,
	HostedRenderJobSnapshot,
} from "./hosted-render-client.port";

export interface CompletedHostedRender {
	readonly job: HostedRenderJobSnapshot;
	readonly download: HostedRenderClientDownload;
}

export class HostedRenderAbortedError extends Error {
	constructor() {
		super("Stopped waiting for the hosted render");
		this.name = "HostedRenderAbortedError";
	}
}

export class HostedRenderTimeoutError extends Error {
	constructor(readonly jobId: string) {
		super("The hosted render is still taking longer than expected");
		this.name = "HostedRenderTimeoutError";
	}
}

export class HostedRenderJobFailedError extends Error {
	constructor(
		readonly jobId: string,
		readonly renderCode: string | undefined,
	) {
		super(renderCode ? `Hosted render failed (${renderCode})` : "Hosted render failed");
		this.name = "HostedRenderJobFailedError";
	}
}

export class HostedRenderJobCanceledError extends Error {
	constructor(readonly jobId: string) {
		super("The hosted render was canceled");
		this.name = "HostedRenderJobCanceledError";
	}
}

type Sleep = (durationMs: number, signal: AbortSignal) => Promise<void>;

function defaultSleep(durationMs: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const finish = () => {
			signal.removeEventListener("abort", abort);
			resolve();
		};
		const timeout = setTimeout(finish, durationMs);
		const abort = () => {
			clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal.addEventListener("abort", abort, { once: true });
	});
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

export interface WaitForHostedRenderOptions {
	readonly signal?: AbortSignal;
	readonly intervalMs?: number;
	readonly timeoutMs?: number;
	readonly sleep?: Sleep;
	readonly now?: () => number;
	readonly onUpdate?: (job: HostedRenderJobSnapshot) => void;
}

/** Poll a durable job without silently switching render targets. */
export async function waitForHostedRender(
	client: HostedRenderClientPort,
	jobId: string,
	options: WaitForHostedRenderOptions = {},
): Promise<CompletedHostedRender> {
	const controller = new AbortController();
	const externalSignal = options.signal;
	const forwardAbort = () => controller.abort(externalSignal?.reason);
	if (externalSignal?.aborted) {
		forwardAbort();
	} else {
		externalSignal?.addEventListener("abort", forwardAbort, { once: true });
	}
	const signal = controller.signal;
	const intervalMs = options.intervalMs ?? 1_100;
	const timeoutMs = options.timeoutMs ?? 15 * 60_000;
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;
	const startedAt = now();
	if (!Number.isFinite(intervalMs) || intervalMs < 0) {
		throw new Error("Hosted render poll interval must be non-negative");
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error("Hosted render timeout must be positive");
	}

	try {
		for (;;) {
			if (signal.aborted) {
				throw new HostedRenderAbortedError();
			}
			if (now() - startedAt >= timeoutMs) {
				throw new HostedRenderTimeoutError(jobId);
			}
			const snapshot = await client.status(jobId, { signal });
			options.onUpdate?.(snapshot.job);
			switch (snapshot.job.status) {
				case "succeeded":
					return {
						job: snapshot.job,
						download: snapshot.download ?? (await client.download(jobId, { signal })),
					};
				case "failed":
					throw new HostedRenderJobFailedError(jobId, snapshot.job.errorCode);
				case "canceled":
					throw new HostedRenderJobCanceledError(jobId);
				case "queued":
				case "running":
					await sleep(intervalMs, signal);
					break;
			}
		}
	} catch (error) {
		if (error instanceof HostedRenderAbortedError || isAbort(error, signal)) {
			throw new HostedRenderAbortedError();
		}
		throw error;
	} finally {
		externalSignal?.removeEventListener("abort", forwardAbort);
	}
}
