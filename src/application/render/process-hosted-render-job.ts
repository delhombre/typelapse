import { type ProjectDocumentV2, parseProjectDocument } from "../project/project-document";
import type { HostedRenderOptions } from "./hosted-render-job";
import type { HostedRenderWorker, RenderJobLease, RenderJobOutput } from "./hosted-render-worker";

type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer Entry)[]
		? readonly DeepReadonly<Entry>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

export interface HostedRenderTemporaryArtifact {
	/** Opaque renderer-owned handle, commonly an absolute temporary file path. */
	readonly temporaryId: string;
	readonly mimeType: string;
	readonly byteSize: number;
	/** A still for the render's public page. Best effort: a render without one still succeeds. */
	readonly poster?: {
		readonly temporaryId: string;
		readonly mimeType: "image/jpeg";
		readonly byteSize: number;
	};
}

export class HostedRenderProcessingError extends Error {
	readonly code: string;
	readonly retryable: boolean;

	constructor(code: string, message: string, options: { readonly retryable: boolean }) {
		super(message);
		this.name = "HostedRenderProcessingError";
		this.code = code;
		this.retryable = options.retryable;
	}
}

export interface HostedMultimediaRendererPort {
	render(input: {
		readonly jobId: string;
		readonly ownerId: string;
		readonly projectId: string;
		readonly revision: number;
		readonly document: DeepReadonly<ProjectDocumentV2>;
		readonly options: HostedRenderOptions;
		readonly compilerVersion: string;
		readonly signal: AbortSignal;
	}): Promise<HostedRenderTemporaryArtifact>;
	/** Removes renderer-owned temporary bytes. Safe to call after a partial failure. */
	cleanup(artifact: HostedRenderTemporaryArtifact): Promise<void>;
}

export interface HostedRenderOutputStoragePort {
	storePrivate(input: {
		readonly objectKey: string;
		readonly artifact: HostedRenderTemporaryArtifact;
		readonly signal: AbortSignal;
	}): Promise<void>;
	/** Deletes a stored result that lost its fence before publication. */
	deletePrivate(objectKey: string): Promise<void>;
}

export interface HostedRenderHeartbeatHandle {
	stop(): Promise<void>;
}

export interface HostedRenderHeartbeatSchedulerPort {
	start(input: {
		readonly intervalMs: number;
		readonly signal: AbortSignal;
		readonly heartbeat: () => Promise<void>;
	}): HostedRenderHeartbeatHandle;
}

export interface HostedRenderProcessor {
	runOnce(
		workerId: string,
		options?: { readonly signal?: AbortSignal },
	): Promise<"idle" | "succeeded" | "retry-scheduled" | "failed" | "lease-lost" | "aborted">;
}

/**
 * Renderer audit (2026-08-30): the V2 timeline resolves text/image/video/audio,
 * but both concrete painters are still legacy code-only:
 * `server/remotion/composition.tsx` consumes code steps and the WebCodecs worker
 * paints `ClientExportJob` code frames. Until a real V2 renderer is injected,
 * deployments must use this fail-closed adapter rather than claim fake success.
 */
export function createUnavailableHostedMultimediaRenderer(): HostedMultimediaRendererPort {
	return {
		async render() {
			throw new HostedRenderProcessingError(
				"multimedia-renderer-unavailable",
				"The deployed Remotion and WebCodecs renderers are code-only; no V2 multimedia renderer is configured",
				{ retryable: false },
			);
		},
		async cleanup() {
			// No runtime was started, so there are no temporary bytes to remove.
		},
	};
}

function freezeRecursively<T>(value: T): DeepReadonly<T> {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value as DeepReadonly<T>;
	}
	for (const entry of Object.values(value)) {
		freezeRecursively(entry);
	}
	return Object.freeze(value) as DeepReadonly<T>;
}

function immutableSnapshot(lease: RenderJobLease): DeepReadonly<ProjectDocumentV2> {
	const cloned = JSON.parse(JSON.stringify(lease.projectDocument)) as unknown;
	const parsed = parseProjectDocument(cloned);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Hosted render lease must contain a V2 snapshot");
	}
	if (parsed.document.project.id !== lease.projectId) {
		throw new Error("Hosted render lease project identity does not match its snapshot");
	}
	return freezeRecursively(parsed.document);
}

function objectKeySegment(value: string): string {
	return encodeURIComponent(value);
}

function outputObjectKey(lease: RenderJobLease): string {
	return [
		"accounts",
		objectKeySegment(lease.ownerId),
		"projects",
		objectKeySegment(lease.projectId),
		"renders",
		objectKeySegment(lease.id),
		`attempt-${lease.attempt}.${lease.renderOptions.format}`,
	].join("/");
}

/** Beside the output it belongs to, so the two share one prefix and one fate. */
function posterObjectKey(lease: RenderJobLease): string {
	return outputObjectKey(lease).replace(/\.[a-z0-9]+$/, ".poster.jpg");
}

function outputFrom(
	artifact: HostedRenderTemporaryArtifact,
	objectKey: string,
	posterKey: string | null,
): RenderJobOutput {
	return {
		objectKey,
		mimeType: artifact.mimeType,
		byteSize: artifact.byteSize,
		...(posterKey ? { posterObjectKey: posterKey } : {}),
	};
}

function validateArtifact(
	artifact: HostedRenderTemporaryArtifact,
	options: HostedRenderOptions,
): void {
	const expectedMimeType = options.format === "mp4" ? "video/mp4" : "video/webm";
	if (
		!artifact.temporaryId.trim() ||
		artifact.mimeType !== expectedMimeType ||
		!Number.isSafeInteger(artifact.byteSize) ||
		artifact.byteSize <= 0
	) {
		throw new HostedRenderProcessingError(
			"renderer-invalid-output",
			"The renderer returned an artifact that does not match the durable render job",
			{ retryable: false },
		);
	}
}

export function createHostedRenderProcessor(input: {
	readonly worker: HostedRenderWorker;
	readonly renderer: HostedMultimediaRendererPort;
	readonly outputs: HostedRenderOutputStoragePort;
	readonly heartbeats: HostedRenderHeartbeatSchedulerPort;
	readonly heartbeatIntervalMs: number;
}): HostedRenderProcessor {
	if (!Number.isSafeInteger(input.heartbeatIntervalMs) || input.heartbeatIntervalMs <= 0) {
		throw new Error("Render heartbeat interval must be a positive integer");
	}

	return {
		async runOnce(workerId, options = {}) {
			const lease = await input.worker.claim(workerId);
			if (!lease) {
				return "idle";
			}
			const controller = new AbortController();
			const abort = () => controller.abort(options.signal?.reason);
			if (options.signal?.aborted) {
				abort();
			} else {
				options.signal?.addEventListener("abort", abort, { once: true });
			}
			let leaseLost = false;
			const heartbeat = input.heartbeats.start({
				intervalMs: input.heartbeatIntervalMs,
				signal: controller.signal,
				heartbeat: async () => {
					try {
						if ((await input.worker.heartbeat(lease)) === "extended") {
							return;
						}
					} catch (error) {
						leaseLost = true;
						controller.abort(error);
						return;
					}
					leaseLost = true;
					controller.abort(new Error("Render lease lost"));
				},
			});
			let heartbeatStopped = false;
			const stopHeartbeat = async () => {
				if (!heartbeatStopped) {
					heartbeatStopped = true;
					await heartbeat.stop();
				}
			};
			let artifact: HostedRenderTemporaryArtifact | null = null;
			let storedObjectKey: string | null = null;
			let storedPosterKey: string | null = null;
			let storageAttempted = false;
			const cleanupArtifact = async () => {
				const current = artifact;
				artifact = null;
				if (current) {
					await input.renderer.cleanup(current);
				}
			};
			const cleanupStoredOutput = async () => {
				const poster = storedPosterKey;
				storedPosterKey = null;
				if (poster) {
					await input.outputs.deletePrivate(poster);
				}
				const current = storedObjectKey;
				storedObjectKey = null;
				if (current && storageAttempted) {
					storageAttempted = false;
					await input.outputs.deletePrivate(current);
				}
			};
			try {
				artifact = await input.renderer.render({
					jobId: lease.id,
					ownerId: lease.ownerId,
					projectId: lease.projectId,
					revision: lease.revision,
					document: immutableSnapshot(lease),
					options: lease.renderOptions,
					compilerVersion: lease.compilerVersion,
					signal: controller.signal,
				});
				validateArtifact(artifact, lease.renderOptions);
				storedObjectKey = outputObjectKey(lease);
				storageAttempted = true;
				await input.outputs.storePrivate({
					objectKey: storedObjectKey,
					artifact,
					signal: controller.signal,
				});
				if (artifact.poster) {
					const posterKey = posterObjectKey(lease);
					try {
						await input.outputs.storePrivate({
							objectKey: posterKey,
							artifact: artifact.poster,
							signal: controller.signal,
						});
						storedPosterKey = posterKey;
					} catch {
						// The page falls back to the site card; the video is what was asked for.
						await input.outputs.deletePrivate(posterKey).catch(() => undefined);
					}
				}
				const output = outputFrom(artifact, storedObjectKey, storedPosterKey);
				await cleanupArtifact();
				await stopHeartbeat();
				if (leaseLost) {
					await cleanupStoredOutput();
					return "lease-lost";
				}
				if (options.signal?.aborted) {
					await cleanupStoredOutput();
					return "aborted";
				}
				if ((await input.worker.succeed(lease, output)) === "lease-lost") {
					await cleanupStoredOutput();
					return "lease-lost";
				}
				storageAttempted = false;
				return "succeeded";
			} catch (error) {
				await stopHeartbeat();
				try {
					await cleanupArtifact();
				} catch {
					// The durable failure remains authoritative even if temp cleanup also failed.
				}
				try {
					await cleanupStoredOutput();
				} catch {
					// A deletion failure cannot publish an unreferenced private object.
				}
				if (leaseLost) {
					return "lease-lost";
				}
				if (options.signal?.aborted) {
					return "aborted";
				}
				if (error instanceof HostedRenderProcessingError) {
					return input.worker.fail(lease, {
						code: error.code,
						message: error.message,
						retryable: error.retryable,
					});
				}
				return input.worker.fail(lease, {
					code: "render-processing-failed",
					message: error instanceof Error ? error.message : "Hosted render processing failed",
				});
			} finally {
				await stopHeartbeat();
				options.signal?.removeEventListener("abort", abort);
			}
		},
	};
}
