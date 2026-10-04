import type {
	CloudDownload,
	CloudExportPort,
	CloudFailure,
	CloudJobStatus,
	CloudPublicPage,
	CloudRenderJob,
} from "@/domain/ports/cloud-export.port";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const STATUSES = new Set<CloudJobStatus>(["queued", "running", "succeeded", "failed", "canceled"]);
const UNREACHABLE = { kind: "unreachable" } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDownload(value: unknown): CloudDownload | null {
	if (
		!isRecord(value) ||
		typeof value.url !== "string" ||
		typeof value.expiresAt !== "string" ||
		typeof value.mimeType !== "string" ||
		typeof value.byteSize !== "number"
	) {
		return null;
	}
	return {
		url: value.url,
		expiresAt: value.expiresAt,
		mimeType: value.mimeType,
		byteSize: value.byteSize,
	};
}

function parsePage(value: unknown): CloudPublicPage | null {
	if (!isRecord(value) || typeof value.public !== "boolean" || typeof value.url !== "string") {
		return null;
	}
	return { public: value.public, url: value.url };
}

function parseJob(body: Record<string, unknown>): CloudRenderJob | null {
	const job = body.job;
	if (!isRecord(job) || typeof job.id !== "string" || !STATUSES.has(job.status as CloudJobStatus)) {
		return null;
	}
	const page = parsePage(body.page);
	return {
		id: job.id,
		status: job.status as CloudJobStatus,
		download: parseDownload(body.download),
		...(page ? { page } : {}),
	};
}

/**
 * Client for the hosted render routes (`server/routes/cloud.ts`). It never
 * throws: a refusal carries the server's own sentence, and anything it cannot
 * read (a restart, a proxy page, no network) is "unreachable", which the
 * poller retries instead of forgetting the job.
 */
export class CloudRenderAdapter implements CloudExportPort {
	constructor(
		private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
		private readonly apiBase: string = "/api",
	) {}

	private async call(
		path: string,
		init?: RequestInit,
	): Promise<{ readonly status: number; readonly body: Record<string, unknown> } | null> {
		try {
			const response = await this.fetcher(`${this.apiBase}${path}`, {
				...init,
				credentials: "include",
			});
			const body: unknown = await response.json().catch(() => null);
			// A 5xx is the API (or the proxy in front of it) failing, not a verdict.
			if (response.status >= 500 || !isRecord(body)) return null;
			return { status: response.status, body };
		} catch {
			return null;
		}
	}

	private refusal(status: number, body: Record<string, unknown>): CloudFailure {
		return {
			kind: "refused",
			status,
			message:
				typeof body.error === "string" && body.error.trim()
					? body.error
					: `Typelapse Cloud refused the request (${status}).`,
			code: typeof body.code === "string" ? body.code : null,
			upgradeTo: typeof body.upgradeTo === "string" ? body.upgradeTo : null,
		};
	}

	async allowance() {
		const answer = await this.call("/billing/allowance");
		if (!answer) return UNREACHABLE;
		if (answer.status !== 200) return this.refusal(answer.status, answer.body);
		const allowance = answer.body.allowance;
		if (
			!isRecord(allowance) ||
			typeof allowance.sentence !== "string" ||
			!isRecord(allowance.limits) ||
			typeof allowance.limits.hostedRenderTime !== "number"
		) {
			return UNREACHABLE;
		}
		return {
			kind: "ok" as const,
			allowance: {
				sentence: allowance.sentence,
				hostedRenders: allowance.limits.hostedRenderTime > 0,
			},
		};
	}

	async submit(input: Parameters<CloudExportPort["submit"]>[0]) {
		const answer = await this.call("/cloud/render", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!answer) return UNREACHABLE;
		if (answer.status !== 202) return this.refusal(answer.status, answer.body);
		const job = parseJob(answer.body);
		return job ? { kind: "accepted" as const, job } : UNREACHABLE;
	}

	async job(jobId: string) {
		const answer = await this.call(`/cloud/jobs/${encodeURIComponent(jobId)}`);
		if (!answer) return UNREACHABLE;
		if (answer.status === 404) return { kind: "not-found" as const };
		if (answer.status !== 200) return this.refusal(answer.status, answer.body);
		const job = parseJob(answer.body);
		return job ? { kind: "found" as const, job } : UNREACHABLE;
	}

	async download(jobId: string) {
		const answer = await this.call(`/cloud/jobs/${encodeURIComponent(jobId)}/download`);
		if (!answer) return UNREACHABLE;
		if (answer.status !== 200) return this.refusal(answer.status, answer.body);
		const download = parseDownload(answer.body.download);
		return download ? { kind: "ready" as const, download } : UNREACHABLE;
	}

	async setPublic(jobId: string, value: boolean) {
		const answer = await this.call(`/cloud/jobs/${encodeURIComponent(jobId)}/public`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ public: value }),
		});
		if (!answer) return UNREACHABLE;
		if (answer.status !== 200) return this.refusal(answer.status, answer.body);
		const page = parsePage(answer.body.page);
		return page ? { kind: "ok" as const, page } : UNREACHABLE;
	}
}
