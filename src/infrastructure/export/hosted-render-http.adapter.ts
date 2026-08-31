import type {
	HostedRenderClientCallOptions,
	HostedRenderClientDownload,
	HostedRenderClientPort,
	HostedRenderClientRequest,
	HostedRenderJobSnapshot,
	HostedRenderStatusSnapshot,
} from "@/application/render/hosted-render-client.port";

export type HostedRenderHttpErrorCode =
	| "authentication-required"
	| "entitlement-required"
	| "not-found"
	| "conflict"
	| "request-too-large"
	| "rate-limited"
	| "unavailable"
	| "request-failed"
	| "network"
	| "invalid-response";

export class HostedRenderHttpError extends Error {
	readonly code: HostedRenderHttpErrorCode;
	readonly status: number | null;
	readonly retryable: boolean;
	readonly currentRevision?: number;
	readonly assetIds?: readonly string[];

	constructor(
		message: string,
		input: {
			readonly code: HostedRenderHttpErrorCode;
			readonly status?: number;
			readonly retryable: boolean;
			readonly currentRevision?: number;
			readonly assetIds?: readonly string[];
		},
	) {
		super(message);
		this.name = "HostedRenderHttpError";
		this.code = input.code;
		this.status = input.status ?? null;
		this.retryable = input.retryable;
		this.currentRevision = input.currentRevision;
		this.assetIds = input.assetIds;
	}
}

interface AdapterOptions {
	readonly baseUrl?: string;
	readonly fetcher?: typeof fetch;
}

const JOB_STATUSES = new Set(["queued", "running", "succeeded", "failed", "canceled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function parseJob(value: unknown): HostedRenderJobSnapshot {
	if (!isRecord(value)) {
		throw invalidResponse("Hosted render response is missing its job");
	}
	if (
		!nonEmptyString(value.id) ||
		!nonEmptyString(value.projectId) ||
		!Number.isSafeInteger(value.revision) ||
		(value.revision as number) < 1 ||
		!nonEmptyString(value.status) ||
		!JOB_STATUSES.has(value.status) ||
		!nonEmptyString(value.createdAt) ||
		!(value.completedAt === null || nonEmptyString(value.completedAt)) ||
		!(value.errorCode === undefined || nonEmptyString(value.errorCode))
	) {
		throw invalidResponse("Hosted render response contains an invalid job");
	}
	return {
		id: value.id,
		projectId: value.projectId,
		revision: value.revision as number,
		status: value.status as HostedRenderJobSnapshot["status"],
		createdAt: value.createdAt,
		completedAt: value.completedAt as string | null,
		...(value.errorCode ? { errorCode: value.errorCode as string } : {}),
	};
}

function parseDownload(value: unknown): HostedRenderClientDownload {
	if (
		!isRecord(value) ||
		value.method !== "GET" ||
		!nonEmptyString(value.url) ||
		!nonEmptyString(value.expiresAt) ||
		!nonEmptyString(value.mimeType) ||
		!Number.isSafeInteger(value.byteSize) ||
		(value.byteSize as number) <= 0
	) {
		throw invalidResponse("Hosted render response contains an invalid download");
	}
	return {
		method: "GET",
		url: value.url,
		expiresAt: value.expiresAt,
		mimeType: value.mimeType,
		byteSize: value.byteSize as number,
	};
}

function invalidResponse(message: string): HostedRenderHttpError {
	return new HostedRenderHttpError(message, {
		code: "invalid-response",
		retryable: false,
	});
}

async function responseBody(response: Response): Promise<unknown> {
	return response.json().catch(() => null);
}

function errorCode(status: number): HostedRenderHttpErrorCode {
	switch (status) {
		case 401:
			return "authentication-required";
		case 403:
			return "entitlement-required";
		case 404:
			return "not-found";
		case 409:
			return "conflict";
		case 413:
			return "request-too-large";
		case 429:
			return "rate-limited";
		case 503:
			return "unavailable";
		default:
			return "request-failed";
	}
}

function httpError(response: Response, body: unknown): HostedRenderHttpError {
	const detail = isRecord(body) ? body : {};
	const message = nonEmptyString(detail.error)
		? detail.error
		: `Hosted render request failed (${response.status})`;
	const currentRevision = Number.isSafeInteger(detail.currentRevision)
		? (detail.currentRevision as number)
		: undefined;
	const assetIds = Array.isArray(detail.assetIds)
		? detail.assetIds.filter(nonEmptyString)
		: undefined;
	return new HostedRenderHttpError(message, {
		code: errorCode(response.status),
		status: response.status,
		retryable: response.status === 429 || response.status >= 500,
		...(currentRevision ? { currentRevision } : {}),
		...(assetIds ? { assetIds } : {}),
	});
}

export class HostedRenderHttpAdapter implements HostedRenderClientPort {
	private readonly baseUrl: string;
	private readonly fetcher: typeof fetch;

	constructor(options: AdapterOptions = {}) {
		this.baseUrl = (options.baseUrl ?? "/api/cloud").replace(/\/$/, "");
		this.fetcher = options.fetcher ?? fetch;
	}

	private async request(path: string, init: RequestInit): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetcher(`${this.baseUrl}${path}`, {
				credentials: "include",
				...init,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw error;
			}
			throw new HostedRenderHttpError("Could not reach the hosted render service", {
				code: "network",
				retryable: true,
			});
		}
		const body = await responseBody(response);
		if (!response.ok) {
			throw httpError(response, body);
		}
		return body;
	}

	async submit(
		request: HostedRenderClientRequest,
		options: HostedRenderClientCallOptions = {},
	): Promise<HostedRenderJobSnapshot> {
		const body = await this.request("/render", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
			signal: options.signal,
		});
		return parseJob(isRecord(body) ? body.job : undefined);
	}

	async status(
		jobId: string,
		options: HostedRenderClientCallOptions = {},
	): Promise<HostedRenderStatusSnapshot> {
		const body = await this.request(`/jobs/${encodeURIComponent(jobId)}`, {
			method: "GET",
			signal: options.signal,
		});
		if (!isRecord(body)) {
			throw invalidResponse("Hosted render response must be an object");
		}
		return {
			job: parseJob(body.job),
			...(body.download === undefined ? {} : { download: parseDownload(body.download) }),
		};
	}

	async download(
		jobId: string,
		options: HostedRenderClientCallOptions = {},
	): Promise<HostedRenderClientDownload> {
		const body = await this.request(`/jobs/${encodeURIComponent(jobId)}/download`, {
			method: "GET",
			signal: options.signal,
		});
		return parseDownload(isRecord(body) ? body.download : undefined);
	}
}
