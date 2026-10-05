import {
	ApiKeyFailure,
	type ApiKeyPort,
	type ApiKeySummary,
	type CreatedApiKey,
	type NewApiKey,
} from "@/domain/ports/api-key.port";

const UNAVAILABLE = "API keys are not available right now.";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateOf(value: unknown): Date {
	const date = typeof value === "string" ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) {
		throw new ApiKeyFailure("unavailable", UNAVAILABLE);
	}
	return date;
}

function optionalDate(value: unknown): Date | null {
	return value === null ? null : dateOf(value);
}

function summaryOf(value: unknown): ApiKeySummary {
	if (!isRecord(value) || typeof value.prefix !== "string" || typeof value.name !== "string") {
		throw new ApiKeyFailure("unavailable", UNAVAILABLE);
	}
	return {
		prefix: value.prefix,
		name: value.name,
		createdAt: dateOf(value.createdAt),
		expiresAt: optionalDate(value.expiresAt),
		lastUsedAt: optionalDate(value.lastUsedAt),
	};
}

/**
 * Browser client for the key routes (`server/routes/api-keys.ts`). The session
 * cookie is the credential, as everywhere in the account island. A refusal the
 * person can act on (signed out, the limit, a bad name) keeps the server's own
 * sentence; anything else says only that keys are unavailable, never why.
 */
export class ApiKeyHttpAdapter implements ApiKeyPort {
	// Wrapped, not stored bare: `this.fetcher(...)` on window.fetch is an illegal invocation.
	constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

	private async call(
		path: string,
		init: RequestInit = {},
	): Promise<{ readonly status: number; readonly body: unknown }> {
		let response: Response;
		try {
			response = await this.fetcher(path, { ...init, credentials: "include" });
		} catch {
			throw new ApiKeyFailure("unavailable", UNAVAILABLE);
		}
		const body: unknown = await response.json().catch(() => null);
		return { status: response.status, body };
	}

	/** The failure a refused call maps to. */
	private refuse(status: number, body: unknown): ApiKeyFailure {
		const sentence = isRecord(body) && typeof body.error === "string" ? body.error : null;
		if (sentence && status === 401) {
			return new ApiKeyFailure("signed-out", sentence);
		}
		if (sentence && status === 409 && isRecord(body) && body.code === "key-limit") {
			return new ApiKeyFailure("key-limit", sentence);
		}
		if (sentence && status === 400) {
			return new ApiKeyFailure("invalid", sentence);
		}
		return new ApiKeyFailure("unavailable", UNAVAILABLE);
	}

	async list(): Promise<readonly ApiKeySummary[]> {
		const { status, body } = await this.call("/api/keys");
		if (status !== 200) {
			throw this.refuse(status, body);
		}
		if (!isRecord(body) || !Array.isArray(body.keys)) {
			throw new ApiKeyFailure("unavailable", UNAVAILABLE);
		}
		return body.keys.map(summaryOf);
	}

	async create(input: NewApiKey): Promise<CreatedApiKey> {
		const { status, body } = await this.call("/api/keys", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		if (status !== 201) {
			throw this.refuse(status, body);
		}
		if (!isRecord(body) || typeof body.key !== "string") {
			throw new ApiKeyFailure("unavailable", UNAVAILABLE);
		}
		return { created: summaryOf(body.created), key: body.key };
	}

	async revoke(prefix: string): Promise<void> {
		const { status, body } = await this.call(`/api/keys/${encodeURIComponent(prefix)}`, {
			method: "DELETE",
		});
		// Gone already is as good as revoked now: the list is what the person reads next.
		if (status !== 204 && status !== 404) {
			throw this.refuse(status, body);
		}
	}
}
