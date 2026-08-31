import {
	type FinalizePrivateAssetInput,
	type PrivateAssetAccess,
	type PrivateAssetApiPort,
	type PrivateAssetSnapshot,
	type PrivateMediaFile,
	type PrivateMediaPortOptions,
	PrivateMediaUploadError,
	type ReservePrivateAssetInput,
	type ResolvePrivateAssetContentInput,
	type SignedPutContract,
	type SignedPutOptions,
	type SignedPutPort,
} from "../../application/assets/private-media-upload.port";
import type { AssetMetadata } from "../../domain/entities/asset";

export type BrowserFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PrivateMediaHttpDependencies {
	readonly fetcher?: BrowserFetch;
	readonly basePath?: string;
}

function abortError(): Error {
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): Date | null {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function invalidResponse(message = "The asset service returned an invalid response."): never {
	throw new PrivateMediaUploadError("invalid-response", message);
}

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function parseMetadata(value: unknown): AssetMetadata {
	if (!isRecord(value)) return invalidResponse();
	const commonKeys = ["kind", "fileName", "mimeType", "byteSize", "checksum"];
	if (
		typeof value.fileName !== "string" ||
		!value.fileName ||
		typeof value.mimeType !== "string" ||
		!value.mimeType ||
		!positiveInteger(value.byteSize) ||
		typeof value.checksum !== "string" ||
		!/^[0-9a-f]{64}$/.test(value.checksum)
	) {
		return invalidResponse();
	}
	const common = {
		fileName: value.fileName,
		mimeType: value.mimeType,
		byteSize: value.byteSize,
		checksum: value.checksum,
	};
	if (value.kind === "image") {
		if (
			!hasExactKeys(value, [...commonKeys, "width", "height"]) ||
			!positiveInteger(value.width) ||
			!positiveInteger(value.height)
		) {
			return invalidResponse();
		}
		return { ...common, kind: value.kind, width: value.width, height: value.height };
	}
	if (value.kind === "video") {
		if (
			!hasExactKeys(value, [...commonKeys, "width", "height", "durationMs"]) ||
			!positiveInteger(value.width) ||
			!positiveInteger(value.height) ||
			!positiveInteger(value.durationMs)
		) {
			return invalidResponse();
		}
		return {
			...common,
			kind: value.kind,
			width: value.width,
			height: value.height,
			durationMs: value.durationMs,
		};
	}
	if (value.kind === "audio") {
		if (!hasExactKeys(value, [...commonKeys, "durationMs"]) || !positiveInteger(value.durationMs)) {
			return invalidResponse();
		}
		return { ...common, kind: value.kind, durationMs: value.durationMs };
	}
	return invalidResponse();
}

function parseAsset(value: unknown): PrivateAssetSnapshot {
	if (!isRecord(value) || !isRecord(value.metadata)) {
		throw new PrivateMediaUploadError(
			"invalid-response",
			"The asset service returned an invalid response.",
		);
	}
	if (
		typeof value.id !== "string" ||
		!value.id ||
		typeof value.projectId !== "string" ||
		!value.projectId ||
		(value.status !== "pending" && value.status !== "ready" && value.status !== "failed")
	) {
		throw new PrivateMediaUploadError(
			"invalid-response",
			"The asset service returned an invalid response.",
		);
	}
	return {
		id: value.id,
		projectId: value.projectId,
		metadata: parseMetadata(value.metadata),
		status: value.status,
	};
}

function parseUpload(value: unknown): SignedPutContract {
	if (!isRecord(value) || !isRecord(value.headers) || !isRecord(value.checksum)) {
		throw new PrivateMediaUploadError(
			"invalid-response",
			"The asset service returned an invalid signed upload.",
		);
	}
	const expiresAt = validDate(value.expiresAt);
	const headers: Record<string, string> = {};
	for (const [name, headerValue] of Object.entries(value.headers)) {
		if (typeof headerValue !== "string") {
			throw new PrivateMediaUploadError(
				"invalid-response",
				"The asset service returned invalid signed headers.",
			);
		}
		headers[name] = headerValue;
	}
	if (
		value.method !== "PUT" ||
		typeof value.url !== "string" ||
		!value.url ||
		value.checksum.algorithm !== "sha256" ||
		typeof value.checksum.value !== "string" ||
		!expiresAt
	) {
		throw new PrivateMediaUploadError(
			"invalid-response",
			"The asset service returned an invalid signed upload.",
		);
	}
	return {
		method: value.method,
		url: value.url,
		headers,
		checksum: { algorithm: value.checksum.algorithm, value: value.checksum.value },
		expiresAt,
	};
}

async function requestJson(
	fetcher: BrowserFetch,
	input: RequestInfo | URL,
	init: RequestInit,
	signal?: AbortSignal,
): Promise<unknown> {
	throwIfAborted(signal);
	let response: Response;
	try {
		response = await fetcher(input, { ...init, signal });
	} catch {
		throwIfAborted(signal);
		throw new PrivateMediaUploadError(
			"unavailable",
			"The private media service is temporarily unavailable.",
		);
	}
	throwIfAborted(signal);
	if (!response.ok) {
		if (response.status === 401) {
			throw new PrivateMediaUploadError(
				"unauthorized",
				"Sign in to upload private media.",
				response.status,
			);
		}
		if (response.status >= 500) {
			throw new PrivateMediaUploadError(
				"unavailable",
				"The private media service is temporarily unavailable.",
				response.status,
			);
		}
		throw new PrivateMediaUploadError(
			"rejected",
			"The private media request was rejected.",
			response.status,
		);
	}
	try {
		const body: unknown = await response.json();
		throwIfAborted(signal);
		return body;
	} catch {
		throwIfAborted(signal);
		throw new PrivateMediaUploadError(
			"invalid-response",
			"The asset service returned an invalid response.",
		);
	}
}

/** Same-origin metadata API. Media bytes never pass through this adapter. */
export class PrivateMediaHttpAdapter implements PrivateAssetApiPort {
	private readonly fetcher: BrowserFetch;
	private readonly basePath: string;

	constructor({ fetcher = globalThis.fetch.bind(globalThis), basePath = "/api/assets" } = {}) {
		this.fetcher = fetcher;
		this.basePath = basePath.replace(/\/$/, "");
	}

	async reserve(input: ReservePrivateAssetInput, options: PrivateMediaPortOptions) {
		const body = await requestJson(
			this.fetcher,
			`${this.basePath}/reserve`,
			{
				method: "POST",
				credentials: "same-origin",
				headers: {
					"content-type": "application/json",
					"Idempotency-Key": input.idempotencyKey,
				},
				body: JSON.stringify({ projectId: input.projectId, metadata: input.metadata }),
			},
			options.signal,
		);
		if (!isRecord(body)) {
			throw new PrivateMediaUploadError(
				"invalid-response",
				"The asset service returned an invalid reservation.",
			);
		}
		return { asset: parseAsset(body.asset), upload: parseUpload(body.upload) };
	}

	async finalize(input: FinalizePrivateAssetInput, options: PrivateMediaPortOptions) {
		const body = await requestJson(
			this.fetcher,
			`${this.basePath}/${encodeURIComponent(input.assetId)}/finalize`,
			{
				method: "POST",
				credentials: "same-origin",
				headers: { "Idempotency-Key": input.idempotencyKey },
			},
			options.signal,
		);
		if (!isRecord(body)) {
			throw new PrivateMediaUploadError(
				"invalid-response",
				"The asset service returned an invalid finalization.",
			);
		}
		return { asset: parseAsset(body.asset) };
	}

	async resolveContent(
		input: ResolvePrivateAssetContentInput,
		options: PrivateMediaPortOptions,
	): Promise<PrivateAssetAccess> {
		const body = await requestJson(
			this.fetcher,
			`${this.basePath}/${encodeURIComponent(input.assetId)}/content`,
			{ method: "GET", credentials: "same-origin" },
			options.signal,
		);
		if (!isRecord(body) || !isRecord(body.access)) {
			throw new PrivateMediaUploadError(
				"invalid-response",
				"The asset service returned invalid private access.",
			);
		}
		const expiresAt = validDate(body.access.expiresAt);
		if (
			body.access.method !== "GET" ||
			typeof body.access.url !== "string" ||
			!body.access.url ||
			!expiresAt
		) {
			throw new PrivateMediaUploadError(
				"invalid-response",
				"The asset service returned invalid private access.",
			);
		}
		return { method: body.access.method, url: body.access.url, expiresAt };
	}
}

export interface BrowserUploadRequest {
	readonly upload: {
		onprogress: ((event: ProgressEvent) => void) | null;
	};
	status: number;
	onload: (() => void) | null;
	onerror: (() => void) | null;
	onabort: (() => void) | null;
	open(method: string, url: string, async?: boolean): void;
	setRequestHeader(name: string, value: string): void;
	send(body: unknown): void;
	abort(): void;
}

export interface BrowserSignedPutDependencies {
	readonly createRequest?: () => BrowserUploadRequest;
}

function defaultRequest(): BrowserUploadRequest {
	return new XMLHttpRequest() as unknown as BrowserUploadRequest;
}

/** XHR is used intentionally: fetch does not expose upload byte progress. */
export class BrowserSignedPutAdapter implements SignedPutPort {
	private readonly createRequest: () => BrowserUploadRequest;

	constructor({ createRequest = defaultRequest }: BrowserSignedPutDependencies = {}) {
		this.createRequest = createRequest;
	}

	put(file: PrivateMediaFile, upload: SignedPutContract, options: SignedPutOptions): Promise<void> {
		throwIfAborted(options.signal);
		if (!(file.opaqueHandle instanceof Blob)) {
			return Promise.reject(
				new PrivateMediaUploadError("invalid-file", "The selected media file is unavailable."),
			);
		}
		const request = this.createRequest();
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const cleanup = () => {
				options.signal?.removeEventListener("abort", abort);
				request.onload = null;
				request.onerror = null;
				request.onabort = null;
				request.upload.onprogress = null;
			};
			const finish = (effect: () => void) => {
				if (settled) return;
				settled = true;
				cleanup();
				effect();
			};
			const rejectAbort = () => finish(() => reject(abortError()));
			const abort = () => {
				request.abort();
				rejectAbort();
			};
			request.onload = () => {
				if (request.status >= 200 && request.status < 300) {
					finish(resolve);
					return;
				}
				finish(() =>
					reject(
						new PrivateMediaUploadError(
							"upload-failed",
							"The private media upload was rejected.",
							request.status,
						),
					),
				);
			};
			request.onerror = () =>
				finish(() =>
					reject(new PrivateMediaUploadError("upload-failed", "The private media upload failed.")),
				);
			request.onabort = rejectAbort;
			request.upload.onprogress = (event) => {
				if (options.signal?.aborted) return;
				options.onProgress?.({
					loadedBytes: event.loaded,
					totalBytes: event.lengthComputable ? event.total : file.byteSize,
				});
			};
			options.signal?.addEventListener("abort", abort, { once: true });
			try {
				throwIfAborted(options.signal);
				request.open(upload.method, upload.url, true);
				for (const [name, value] of Object.entries(upload.headers)) {
					throwIfAborted(options.signal);
					request.setRequestHeader(name, value);
				}
				throwIfAborted(options.signal);
				request.send(file.opaqueHandle);
			} catch {
				if (options.signal?.aborted) {
					abort();
					return;
				}
				finish(() =>
					reject(
						new PrivateMediaUploadError(
							"upload-failed",
							"The private media upload could not start.",
						),
					),
				);
			}
		});
	}
}

export function createPrivateMediaIdempotencyKey(): string {
	if (!globalThis.crypto?.randomUUID) {
		throw new PrivateMediaUploadError(
			"unavailable",
			"Secure upload request keys are unavailable in this browser.",
		);
	}
	return globalThis.crypto.randomUUID();
}
