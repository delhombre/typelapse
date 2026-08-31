import {
	type PrivateAssetApiPort,
	type PrivateMediaFile,
	PrivateMediaUploadError,
} from "../assets/private-media-upload.port";
import { registerUploadedPrivateMediaSource } from "../assets/register-uploaded-private-media-source";
import type {
	SceneAssetSource,
	SceneAssetSourceRegistryPort,
} from "../assets/scene-asset-source.port";
import type {
	PrivateMediaUploadProgress,
	UploadPrivateMedia,
	UploadedPrivateMedia,
} from "../assets/upload-private-media";
import type { ClientSession } from "../auth/client-auth.port";
import {
	HostedProjectApiError,
	type HostedProjectApiPort,
	type HostedProjectRecord,
} from "./hosted-project-api.port";
import { hydrateProjectDocument } from "./hydrate-project-document";
import { type ProjectDocumentV2, parseProjectDocument } from "./project-document";
import { registerUploadedAsset } from "./register-uploaded-asset";
import { createHostedProjectSaver } from "./save-hosted-project";
import { serializeProjectDocument } from "./serialize-project-document";

export type HostedProjectSyncErrorCode =
	| "authentication-required"
	| "session-expired"
	| "invalid-document"
	| "project-not-found"
	| "project-conflict"
	| "request-rejected"
	| "service-unavailable";

const SAFE_SYNC_MESSAGES: Readonly<Record<HostedProjectSyncErrorCode, string>> = {
	"authentication-required": "Sign in before syncing this project.",
	"session-expired": "Your session has expired. Sign in again to continue syncing.",
	"invalid-document": "This project cannot be synced in its current form.",
	"project-not-found": "This hosted project is no longer available.",
	"project-conflict": "This project changed elsewhere. Review the latest version before saving.",
	"request-rejected": "The hosted project request was rejected.",
	"service-unavailable": "Hosted project sync is temporarily unavailable.",
};

/** Stable, non-reflective failure suitable for a product surface. */
export class HostedProjectSyncError extends Error {
	readonly code: HostedProjectSyncErrorCode;

	constructor(code: HostedProjectSyncErrorCode) {
		super(SAFE_SYNC_MESSAGES[code]);
		this.name = "HostedProjectSyncError";
		this.code = code;
	}
}

export type HostedProjectSyncState =
	| { readonly kind: "disconnected" }
	| { readonly kind: "connecting" }
	| {
			readonly kind: "ready";
			readonly projectId: string;
			readonly revision: number;
	  }
	| {
			readonly kind: "queued";
			readonly projectId: string;
			readonly revision: number;
	  }
	| {
			readonly kind: "saving";
			readonly projectId: string;
			readonly revision: number;
			readonly hasQueuedChanges: boolean;
	  }
	| {
			readonly kind: "uploading";
			readonly projectId: string;
			readonly revision: number;
			readonly phase: PrivateMediaUploadProgress["phase"];
	  }
	| {
			readonly kind: "conflict";
			readonly projectId: string;
			readonly localRevision: number;
			readonly currentRevision: number;
	  }
	| { readonly kind: "missing"; readonly projectId: string }
	| { readonly kind: "error"; readonly error: HostedProjectSyncError }
	| { readonly kind: "stopped" };

export interface ConnectHostedProjectInput {
	/** The browser-safe Better Auth projection. It is never sent as an owner id. */
	readonly session: ClientSession | null;
	readonly localDocument: ProjectDocumentV2;
	/** A durable hosted id previously returned by this coordinator. */
	readonly hostedProjectId?: string;
}

export interface ConnectedHostedProject {
	readonly project: HostedProjectRecord;
	readonly loaded: boolean;
}

export type FlushHostedProjectResult =
	| { readonly outcome: "noop"; readonly project: HostedProjectRecord }
	| { readonly outcome: "saved"; readonly project: HostedProjectRecord }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

export type ImportHostedMediaResult =
	| {
			readonly outcome: "imported";
			readonly project: HostedProjectRecord;
			readonly uploaded: UploadedPrivateMedia;
			readonly source: SceneAssetSource;
	  }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

export interface ImportHostedMediaOptions {
	readonly signal?: AbortSignal;
	readonly onProgress?: (progress: PrivateMediaUploadProgress) => void;
}

export interface HostedProjectSyncCoordinator {
	connect(input: ConnectHostedProjectInput): Promise<ConnectedHostedProject>;
	scheduleSave(document: ProjectDocumentV2): void;
	flush(): Promise<FlushHostedProjectResult>;
	importMedia(
		file: PrivateMediaFile,
		options?: ImportHostedMediaOptions,
	): Promise<ImportHostedMediaResult>;
	refreshMediaSources(): Promise<readonly SceneAssetSource[]>;
	getState(): HostedProjectSyncState;
	subscribe(listener: (state: HostedProjectSyncState) => void): () => void;
	stop(): void;
}

export interface HostedProjectSyncDependencies {
	readonly api: HostedProjectApiPort;
	readonly assets: PrivateAssetApiPort;
	readonly uploader: UploadPrivateMedia;
	readonly registry: SceneAssetSourceRegistryPort;
}

export interface HostedProjectSyncOptions {
	readonly debounceMs?: number;
	readonly now?: () => Date;
	readonly setTimer?: (effect: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
	readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

function abortError(): Error {
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function syncError(error: unknown): HostedProjectSyncError {
	if (error instanceof HostedProjectSyncError) return error;
	if (error instanceof HostedProjectApiError) {
		if (error.code === "unauthorized") return new HostedProjectSyncError("authentication-required");
		if (error.code === "unavailable") return new HostedProjectSyncError("service-unavailable");
		return new HostedProjectSyncError("request-rejected");
	}
	if (error instanceof PrivateMediaUploadError) {
		if (error.code === "unauthorized") return new HostedProjectSyncError("authentication-required");
		if (error.code === "unavailable" || error.code === "upload-failed") {
			return new HostedProjectSyncError("service-unavailable");
		}
		return new HostedProjectSyncError("request-rejected");
	}
	return new HostedProjectSyncError("service-unavailable");
}

const FORBIDDEN_DOCUMENT_KEYS = new Set(["opaquehandle", "signedurl", "src", "url"]);
const EPHEMERAL_SCHEME = /^(?:blob|data|https?):/i;

function assertNoRuntimeMedia(value: unknown, seen = new WeakSet<object>()): void {
	if (typeof value === "string") {
		if (EPHEMERAL_SCHEME.test(value.trim())) {
			throw new HostedProjectSyncError("invalid-document");
		}
		return;
	}
	if (typeof value !== "object" || value === null) return;
	if (seen.has(value)) throw new HostedProjectSyncError("invalid-document");
	seen.add(value);
	if (Array.isArray(value)) {
		for (const entry of value) assertNoRuntimeMedia(entry, seen);
		return;
	}
	for (const [key, entry] of Object.entries(value)) {
		if (FORBIDDEN_DOCUMENT_KEYS.has(key.toLowerCase())) {
			throw new HostedProjectSyncError("invalid-document");
		}
		assertNoRuntimeMedia(entry, seen);
	}
}

function canonicalDocument(input: ProjectDocumentV2): ProjectDocumentV2 {
	try {
		assertNoRuntimeMedia(input);
		const parsed = parseProjectDocument(input);
		if (parsed.schemaVersion !== 2) throw new HostedProjectSyncError("invalid-document");
		hydrateProjectDocument(parsed.document);
		return parsed.document;
	} catch (error) {
		if (error instanceof HostedProjectSyncError) throw error;
		throw new HostedProjectSyncError("invalid-document");
	}
}

function fingerprint(document: ProjectDocumentV2): string {
	return JSON.stringify(document);
}

function activeSession(session: ClientSession | null, now: Date): ClientSession {
	if (!session || !session.account.id.trim()) {
		throw new HostedProjectSyncError("authentication-required");
	}
	if (Number.isNaN(session.expiresAt.getTime()) || session.expiresAt.getTime() <= now.getTime()) {
		throw new HostedProjectSyncError("session-expired");
	}
	return session;
}

function canCreateDirectly(document: ProjectDocumentV2): boolean {
	return document.project.assets.length === 0;
}

function combineSignals(
	lifetime: AbortSignal,
	operation?: AbortSignal,
): {
	readonly signal: AbortSignal;
	release(): void;
} {
	const controller = new AbortController();
	const abort = () => controller.abort();
	lifetime.addEventListener("abort", abort, { once: true });
	operation?.addEventListener("abort", abort, { once: true });
	if (lifetime.aborted || operation?.aborted) controller.abort();
	return {
		signal: controller.signal,
		release() {
			lifetime.removeEventListener("abort", abort);
			operation?.removeEventListener("abort", abort);
		},
	};
}

class DefaultHostedProjectSyncCoordinator implements HostedProjectSyncCoordinator {
	private state: HostedProjectSyncState = { kind: "disconnected" };
	private readonly listeners = new Set<(state: HostedProjectSyncState) => void>();
	private readonly lifetime = new AbortController();
	private readonly saver;
	private readonly debounceMs: number;
	private readonly now: () => Date;
	private readonly setTimer: HostedProjectSyncOptions["setTimer"];
	private readonly clearTimer: HostedProjectSyncOptions["clearTimer"];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private operationTail: Promise<void> = Promise.resolve();
	private session: ClientSession | null = null;
	private current: HostedProjectRecord | null = null;
	private latestDocument: ProjectDocumentV2 | null = null;
	private latestFingerprint: string | null = null;
	private savedFingerprint: string | null = null;

	constructor(
		private readonly dependencies: HostedProjectSyncDependencies,
		options: HostedProjectSyncOptions,
	) {
		this.saver = createHostedProjectSaver(dependencies.api);
		this.debounceMs = options.debounceMs ?? 350;
		this.now = options.now ?? (() => new Date());
		this.setTimer = options.setTimer ?? ((effect, delayMs) => setTimeout(effect, delayMs));
		this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
		if (!Number.isFinite(this.debounceMs) || this.debounceMs < 0) {
			throw new Error("Hosted project debounce must be a non-negative duration");
		}
	}

	getState(): HostedProjectSyncState {
		return this.state;
	}

	subscribe(listener: (state: HostedProjectSyncState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private publish(state: HostedProjectSyncState): void {
		if (this.state.kind === "stopped" && state.kind !== "stopped") return;
		this.state = state;
		for (const listener of this.listeners) {
			try {
				listener(state);
			} catch {}
		}
	}

	private enqueue<T>(effect: () => Promise<T>): Promise<T> {
		const result = this.operationTail.then(effect, effect);
		this.operationTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private assertLiveSession(): ClientSession {
		throwIfAborted(this.lifetime.signal);
		return activeSession(this.session, this.now());
	}

	private requireCurrent(): HostedProjectRecord {
		this.assertLiveSession();
		if (!this.current) throw new HostedProjectSyncError("project-not-found");
		if (this.state.kind === "missing") throw new HostedProjectSyncError("project-not-found");
		if (this.state.kind === "conflict") throw new HostedProjectSyncError("project-conflict");
		if (this.state.kind === "error") throw this.state.error;
		return this.current;
	}

	private clearDebounce(): void {
		if (this.timer === null) return;
		this.clearTimer?.(this.timer);
		this.timer = null;
	}

	private armDebounce(): void {
		this.clearDebounce();
		this.timer =
			this.setTimer?.(() => {
				this.timer = null;
				void this.flush().catch(() => undefined);
			}, this.debounceMs) ?? null;
	}

	private handleFailure(error: unknown): never {
		if (isAbortError(error)) throw error;
		const failure = syncError(error);
		this.publish({ kind: "error", error: failure });
		throw failure;
	}

	private async resolvedSources(
		document: ProjectDocumentV2,
		signal: AbortSignal,
	): Promise<readonly UploadedPrivateMedia[]> {
		const projectId = document.project.id;
		const sources = await Promise.all(
			document.project.assets.map(async (asset) => {
				throwIfAborted(signal);
				const access = await this.dependencies.assets.resolveContent(
					{ assetId: asset.id },
					{ signal },
				);
				throwIfAborted(signal);
				const { id, ...metadata } = asset;
				return {
					asset: {
						id,
						projectId,
						metadata,
						status: "ready" as const,
					},
					access,
				};
			}),
		);
		throwIfAborted(signal);
		return sources;
	}

	private installSources(sources: readonly UploadedPrivateMedia[]): readonly SceneAssetSource[] {
		this.dependencies.registry.revokeAll();
		try {
			return sources.map((uploaded) =>
				registerUploadedPrivateMediaSource(this.dependencies.registry, uploaded),
			);
		} catch (error) {
			this.dependencies.registry.revokeAll();
			throw error;
		}
	}

	async connect(input: ConnectHostedProjectInput): Promise<ConnectedHostedProject> {
		if (this.state.kind !== "disconnected") {
			throw new HostedProjectSyncError("request-rejected");
		}
		const session = activeSession(input.session, this.now());
		const localDocument = canonicalDocument(input.localDocument);
		this.session = session;
		this.publish({ kind: "connecting" });

		return this.enqueue(async () => {
			const signal = this.lifetime.signal;
			try {
				this.assertLiveSession();
				this.dependencies.registry.revokeAll();
				const requestedId = input.hostedProjectId?.trim() || localDocument.project.id;
				const loaded = await this.dependencies.api.load(requestedId, { signal });
				throwIfAborted(signal);
				let project: HostedProjectRecord;
				let wasLoaded = true;
				if (loaded) {
					project = loaded;
				} else if (input.hostedProjectId) {
					this.publish({ kind: "missing", projectId: requestedId });
					throw new HostedProjectSyncError("project-not-found");
				} else {
					if (!canCreateDirectly(localDocument)) {
						throw new HostedProjectSyncError("invalid-document");
					}
					project = await this.dependencies.api.create(localDocument, { signal });
					throwIfAborted(signal);
					wasLoaded = false;
				}
				const canonical = canonicalDocument(project.document);
				if (canonical.project.id !== project.id) {
					throw new HostedProjectSyncError("invalid-document");
				}
				const sources = await this.resolvedSources(canonical, signal);
				throwIfAborted(signal);
				this.installSources(sources);
				this.current = { ...project, document: canonical };
				this.savedFingerprint = fingerprint(canonical);
				this.publish({ kind: "ready", projectId: project.id, revision: project.revision });
				return { project: this.current, loaded: wasLoaded };
			} catch (error) {
				if (this.state.kind === "missing" || isAbortError(error)) throw error;
				return this.handleFailure(error);
			}
		});
	}

	scheduleSave(input: ProjectDocumentV2): void {
		const current = this.requireCurrent();
		const document = canonicalDocument(input);
		if (document.project.id !== current.id) {
			throw new HostedProjectSyncError("invalid-document");
		}
		const nextFingerprint = fingerprint(document);
		if (nextFingerprint === this.savedFingerprint || nextFingerprint === this.latestFingerprint) {
			return;
		}
		this.latestDocument = document;
		this.latestFingerprint = nextFingerprint;
		if (this.state.kind === "saving") {
			this.publish({ ...this.state, hasQueuedChanges: true });
		} else if (this.state.kind !== "uploading") {
			this.publish({ kind: "queued", projectId: current.id, revision: current.revision });
		}
		this.armDebounce();
	}

	private async persistLatest(): Promise<FlushHostedProjectResult> {
		const current = this.requireCurrent();
		const document = this.latestDocument;
		const documentFingerprint = this.latestFingerprint;
		if (!document || !documentFingerprint || documentFingerprint === this.savedFingerprint) {
			if (documentFingerprint === this.savedFingerprint) {
				this.latestDocument = null;
				this.latestFingerprint = null;
			}
			return { outcome: "noop", project: current };
		}
		this.latestDocument = null;
		this.latestFingerprint = null;
		this.publish({
			kind: "saving",
			projectId: current.id,
			revision: current.revision,
			hasQueuedChanges: false,
		});
		try {
			const result = await this.saver.execute(
				{
					document,
					target: {
						kind: "update",
						id: current.id,
						expectedRevision: current.revision,
					},
				},
				{ signal: this.lifetime.signal },
			);
			throwIfAborted(this.lifetime.signal);
			if (result.outcome === "conflict") {
				this.publish({
					kind: "conflict",
					projectId: current.id,
					localRevision: current.revision,
					currentRevision: result.currentRevision,
				});
				return result;
			}
			if (result.outcome === "not-found") {
				this.publish({ kind: "missing", projectId: current.id });
				return result;
			}
			this.current = result.project;
			this.savedFingerprint = fingerprint(result.project.document);
			if (this.latestDocument) {
				this.publish({
					kind: "queued",
					projectId: result.project.id,
					revision: result.project.revision,
				});
				this.armDebounce();
			} else {
				this.publish({
					kind: "ready",
					projectId: result.project.id,
					revision: result.project.revision,
				});
			}
			return { outcome: "saved", project: result.project };
		} catch (error) {
			return this.handleFailure(error);
		}
	}

	flush(): Promise<FlushHostedProjectResult> {
		this.requireCurrent();
		this.clearDebounce();
		return this.enqueue(() => this.persistLatest());
	}

	async importMedia(
		file: PrivateMediaFile,
		options: ImportHostedMediaOptions = {},
	): Promise<ImportHostedMediaResult> {
		const flushed = await this.flush();
		if (flushed.outcome === "conflict" || flushed.outcome === "not-found") return flushed;
		return this.enqueue(async () => {
			const current = this.requireCurrent();
			const combined = combineSignals(this.lifetime.signal, options.signal);
			try {
				const uploaded = await this.dependencies.uploader.execute(
					{ file, projectId: current.id },
					{
						signal: combined.signal,
						onProgress: (progress) => {
							this.publish({
								kind: "uploading",
								projectId: current.id,
								revision: current.revision,
								phase: progress.phase,
							});
							options.onProgress?.(progress);
						},
					},
				);
				throwIfAborted(combined.signal);
				const pending = this.latestDocument;
				const base = pending ?? current.document;
				const hydrated = hydrateProjectDocument(base);
				const project = registerUploadedAsset(hydrated.project, uploaded);
				const document = canonicalDocument(serializeProjectDocument({ ...hydrated, project }));
				if (pending === this.latestDocument) {
					this.latestDocument = null;
					this.latestFingerprint = null;
					this.clearDebounce();
				}
				const result = await this.saver.execute(
					{
						document,
						target: {
							kind: "update",
							id: current.id,
							expectedRevision: current.revision,
						},
					},
					{ signal: combined.signal },
				);
				throwIfAborted(combined.signal);
				if (result.outcome === "conflict") {
					this.publish({
						kind: "conflict",
						projectId: current.id,
						localRevision: current.revision,
						currentRevision: result.currentRevision,
					});
					return result;
				}
				if (result.outcome === "not-found") {
					this.publish({ kind: "missing", projectId: current.id });
					return result;
				}
				this.current = result.project;
				this.savedFingerprint = fingerprint(result.project.document);
				const source = registerUploadedPrivateMediaSource(this.dependencies.registry, uploaded);
				this.publish({
					kind: "ready",
					projectId: result.project.id,
					revision: result.project.revision,
				});
				return { outcome: "imported", project: result.project, uploaded, source };
			} catch (error) {
				return this.handleFailure(error);
			} finally {
				combined.release();
			}
		});
	}

	refreshMediaSources(): Promise<readonly SceneAssetSource[]> {
		return this.enqueue(async () => {
			const current = this.requireCurrent();
			try {
				const sources = await this.resolvedSources(current.document, this.lifetime.signal);
				throwIfAborted(this.lifetime.signal);
				const installed = this.installSources(sources);
				this.publish({
					kind: "ready",
					projectId: current.id,
					revision: current.revision,
				});
				return installed;
			} catch (error) {
				return this.handleFailure(error);
			}
		});
	}

	stop(): void {
		if (this.state.kind === "stopped") return;
		this.clearDebounce();
		this.latestDocument = null;
		this.latestFingerprint = null;
		this.lifetime.abort();
		this.dependencies.registry.revokeAll();
		this.publish({ kind: "stopped" });
		this.listeners.clear();
	}
}

export function createHostedProjectSyncCoordinator(
	dependencies: HostedProjectSyncDependencies,
	options: HostedProjectSyncOptions = {},
): HostedProjectSyncCoordinator {
	return new DefaultHostedProjectSyncCoordinator(dependencies, options);
}
