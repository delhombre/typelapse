import {
	HostedProjectApiError,
	type HostedProjectApiOptions,
	type HostedProjectApiPort,
	type HostedProjectRecord,
	type HostedProjectSummary,
	type HostedProjectUpdateResult,
} from "../../application/project/hosted-project-api.port";
import {
	type ProjectDocumentV2,
	parseProjectDocument,
} from "../../application/project/project-document";

export type HostedProjectFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export interface HostedProjectHttpDependencies {
	readonly fetcher?: HostedProjectFetch;
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

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function invalidResponse(): never {
	throw new HostedProjectApiError(
		"invalid-response",
		"The hosted project service returned an invalid response.",
	);
}

function sameOriginBasePath(value: string): string {
	const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
	if (
		!normalized.startsWith("/") ||
		normalized.startsWith("//") ||
		normalized.includes("\\") ||
		normalized.includes("?") ||
		normalized.includes("#")
	) {
		throw new HostedProjectApiError("rejected", "The hosted project endpoint must be same-origin.");
	}
	return normalized;
}

function parseIsoDate(value: unknown): Date {
	if (typeof value !== "string") return invalidResponse();
	const date = new Date(value);
	if (Number.isNaN(date.getTime()) || date.toISOString() !== value) return invalidResponse();
	return date;
}

function nonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseSummary(value: unknown): HostedProjectSummary {
	if (!isRecord(value)) return invalidResponse();
	if (
		!hasExactKeys(value, ["id", "title", "revision", "sceneCount", "updatedAt"]) ||
		typeof value.id !== "string" ||
		!value.id ||
		typeof value.title !== "string" ||
		!value.title ||
		!nonNegativeInteger(value.revision) ||
		!nonNegativeInteger(value.sceneCount)
	) {
		return invalidResponse();
	}
	return {
		id: value.id,
		title: value.title,
		revision: value.revision,
		sceneCount: value.sceneCount,
		updatedAt: parseIsoDate(value.updatedAt),
	};
}

function parseV2Document(value: unknown): ProjectDocumentV2 {
	try {
		const parsed = parseProjectDocument(value);
		if (parsed.schemaVersion !== 2) return invalidResponse();
		return parsed.document;
	} catch {
		return invalidResponse();
	}
}

function parseProjectRecord(value: unknown): HostedProjectRecord {
	if (!isRecord(value)) return invalidResponse();
	if (
		!hasExactKeys(value, ["id", "ownerId", "revision", "document", "createdAt", "updatedAt"]) ||
		typeof value.id !== "string" ||
		!value.id ||
		typeof value.ownerId !== "string" ||
		!value.ownerId ||
		!nonNegativeInteger(value.revision)
	) {
		return invalidResponse();
	}
	const document = parseV2Document(value.document);
	if (document.project.id !== value.id) return invalidResponse();
	return {
		id: value.id,
		revision: value.revision,
		document,
		createdAt: parseIsoDate(value.createdAt),
		updatedAt: parseIsoDate(value.updatedAt),
	};
}

function parseProjectEnvelope(value: unknown): HostedProjectRecord {
	if (!isRecord(value) || !hasExactKeys(value, ["project"])) return invalidResponse();
	return parseProjectRecord(value.project);
}

async function requestResponse(
	fetcher: HostedProjectFetch,
	input: RequestInfo | URL,
	init: RequestInit,
	signal?: AbortSignal,
): Promise<Response> {
	throwIfAborted(signal);
	let response: Response;
	try {
		response = await fetcher(input, { ...init, signal });
	} catch {
		throwIfAborted(signal);
		throw new HostedProjectApiError(
			"unavailable",
			"The hosted project service is temporarily unavailable.",
		);
	}
	throwIfAborted(signal);
	return response;
}

function throwForStatus(status: number): never {
	if (status === 401) {
		throw new HostedProjectApiError("unauthorized", "Sign in to sync hosted projects.", status);
	}
	if (status >= 500) {
		throw new HostedProjectApiError(
			"unavailable",
			"The hosted project service is temporarily unavailable.",
			status,
		);
	}
	throw new HostedProjectApiError("rejected", "The hosted project request was rejected.", status);
}

async function responseJson(response: Response, signal?: AbortSignal): Promise<unknown> {
	try {
		const body: unknown = await response.json();
		throwIfAborted(signal);
		return body;
	} catch {
		throwIfAborted(signal);
		return invalidResponse();
	}
}

async function requestJson(
	fetcher: HostedProjectFetch,
	input: RequestInfo | URL,
	init: RequestInit,
	expectedStatus: number,
	signal?: AbortSignal,
): Promise<unknown> {
	const response = await requestResponse(fetcher, input, init, signal);
	if (!response.ok) return throwForStatus(response.status);
	if (response.status !== expectedStatus) return invalidResponse();
	return responseJson(response, signal);
}

/** Same-origin browser adapter for authenticated hosted project sync. */
export class HostedProjectHttpAdapter implements HostedProjectApiPort {
	private readonly fetcher: HostedProjectFetch;
	private readonly basePath: string;

	constructor({ fetcher = globalThis.fetch.bind(globalThis), basePath = "/api/projects" } = {}) {
		this.fetcher = fetcher;
		this.basePath = sameOriginBasePath(basePath);
	}

	async list(options: HostedProjectApiOptions = {}): Promise<readonly HostedProjectSummary[]> {
		const body = await requestJson(
			this.fetcher,
			this.basePath,
			{ method: "GET", credentials: "same-origin" },
			200,
			options.signal,
		);
		if (!isRecord(body) || !hasExactKeys(body, ["projects"]) || !Array.isArray(body.projects)) {
			return invalidResponse();
		}
		return body.projects.map(parseSummary);
	}

	async create(
		document: ProjectDocumentV2,
		options: HostedProjectApiOptions = {},
	): Promise<HostedProjectRecord> {
		const body = await requestJson(
			this.fetcher,
			this.basePath,
			{
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ document }),
			},
			201,
			options.signal,
		);
		return parseProjectEnvelope(body);
	}

	async load(
		id: string,
		options: HostedProjectApiOptions = {},
	): Promise<HostedProjectRecord | null> {
		const response = await requestResponse(
			this.fetcher,
			`${this.basePath}/${encodeURIComponent(id)}`,
			{ method: "GET", credentials: "same-origin" },
			options.signal,
		);
		if (response.status === 404) return null;
		if (!response.ok) return throwForStatus(response.status);
		if (response.status !== 200) return invalidResponse();
		const project = parseProjectEnvelope(await responseJson(response, options.signal));
		if (project.id !== id) return invalidResponse();
		return project;
	}

	async update(
		input: {
			readonly id: string;
			readonly expectedRevision: number;
			readonly document: ProjectDocumentV2;
		},
		options: HostedProjectApiOptions = {},
	): Promise<HostedProjectUpdateResult> {
		const response = await requestResponse(
			this.fetcher,
			`${this.basePath}/${encodeURIComponent(input.id)}`,
			{
				method: "PUT",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expectedRevision: input.expectedRevision,
					document: input.document,
				}),
			},
			options.signal,
		);
		if (response.status === 404) return { outcome: "not-found" };
		if (response.status === 409) {
			const body = await responseJson(response, options.signal);
			if (
				!isRecord(body) ||
				!hasExactKeys(body, ["error", "currentRevision"]) ||
				typeof body.error !== "string" ||
				!body.error ||
				!nonNegativeInteger(body.currentRevision)
			) {
				return invalidResponse();
			}
			return { outcome: "conflict", currentRevision: body.currentRevision };
		}
		if (!response.ok) return throwForStatus(response.status);
		if (response.status !== 200) return invalidResponse();
		const project = parseProjectEnvelope(await responseJson(response, options.signal));
		if (project.id !== input.id) return invalidResponse();
		return { outcome: "updated", project };
	}

	async delete(id: string, options: HostedProjectApiOptions = {}): Promise<boolean> {
		const response = await requestResponse(
			this.fetcher,
			`${this.basePath}/${encodeURIComponent(id)}`,
			{ method: "DELETE", credentials: "same-origin" },
			options.signal,
		);
		if (response.status === 404) return false;
		if (response.status === 204) return true;
		if (response.status === 409) {
			throw new HostedProjectApiError(
				"render-active",
				"A render is still running on this project.",
				409,
			);
		}
		if (!response.ok) return throwForStatus(response.status);
		return invalidResponse();
	}
}
