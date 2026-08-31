import type {
	PrivateMediaFile,
	SignedPutContract,
} from "@/application/assets/private-media-upload.port";
import type { AssetMetadata } from "@/domain/entities/asset";
import {
	BrowserSignedPutAdapter,
	type BrowserUploadRequest,
	PrivateMediaHttpAdapter,
} from "@/infrastructure/assets/private-media-http.adapter";
import { describe, expect, it, vi } from "vitest";

const CHECKSUM = "a".repeat(64);
const METADATA: AssetMetadata = {
	kind: "image",
	fileName: "cover.png",
	mimeType: "image/png",
	byteSize: 3,
	checksum: CHECKSUM,
	width: 10,
	height: 20,
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("private media HTTP adapter", () => {
	it("uses the reserve, finalize and private-content contracts with explicit idempotency headers", async () => {
		const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ input, init });
			if (String(input).endsWith("/reserve")) {
				return jsonResponse(
					{
						asset: {
							id: "asset-1",
							projectId: "project-1",
							metadata: METADATA,
							status: "pending",
						},
						upload: {
							method: "PUT",
							url: "https://objects.example.test/upload",
							headers: { "content-type": "image/png" },
							checksum: { algorithm: "sha256", value: CHECKSUM },
							expiresAt: "2026-08-30T12:15:00.000Z",
						},
					},
					201,
				);
			}
			if (String(input).endsWith("/finalize")) {
				return jsonResponse({
					asset: {
						id: "asset-1",
						projectId: "project-1",
						metadata: METADATA,
						status: "ready",
					},
				});
			}
			return jsonResponse({
				access: {
					method: "GET",
					url: "https://objects.example.test/private/asset-1",
					expiresAt: "2026-08-30T12:05:00.000Z",
				},
			});
		});
		const adapter = new PrivateMediaHttpAdapter({ fetcher });

		const reserved = await adapter.reserve(
			{ projectId: "project-1", metadata: METADATA, idempotencyKey: "reserve-1" },
			{},
		);
		await adapter.finalize({ assetId: "asset-1", idempotencyKey: "finalize-1" }, {});
		const access = await adapter.resolveContent({ assetId: "asset-1" }, {});

		expect(reserved.upload.expiresAt).toEqual(new Date("2026-08-30T12:15:00.000Z"));
		expect(access.expiresAt).toEqual(new Date("2026-08-30T12:05:00.000Z"));
		expect(requests).toHaveLength(3);
		expect(requests[0]).toMatchObject({
			input: "/api/assets/reserve",
			init: {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"content-type": "application/json",
					"Idempotency-Key": "reserve-1",
				},
			},
		});
		expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
			projectId: "project-1",
			metadata: METADATA,
		});
		expect(requests[1]).toMatchObject({
			input: "/api/assets/asset-1/finalize",
			init: {
				method: "POST",
				credentials: "same-origin",
				headers: { "Idempotency-Key": "finalize-1" },
			},
		});
		expect(requests[1]?.init?.body).toBeUndefined();
		expect(requests[2]).toMatchObject({
			input: "/api/assets/asset-1/content",
			init: { method: "GET", credentials: "same-origin" },
		});
	});

	it("checks an already-aborted signal before making a request", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetcher = vi.fn();
		const adapter = new PrivateMediaHttpAdapter({ fetcher });

		await expect(
			adapter.resolveContent({ assetId: "asset-1" }, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("never reflects response or transport secrets in client errors", async () => {
		const rejected = new PrivateMediaHttpAdapter({
			fetcher: async () => new Response("database password=hunter2", { status: 403 }),
		});
		const unavailable = new PrivateMediaHttpAdapter({
			fetcher: async () => {
				throw new Error("https://private.example.test?token=secret");
			},
		});

		const rejectedError = await rejected
			.resolveContent({ assetId: "asset-1" }, {})
			.catch((error: unknown) => error);
		const unavailableError = await unavailable
			.resolveContent({ assetId: "asset-1" }, {})
			.catch((error: unknown) => error);

		expect(rejectedError).toMatchObject({ code: "rejected", status: 403 });
		expect(unavailableError).toMatchObject({ code: "unavailable" });
		expect(String(rejectedError)).not.toContain("hunter2");
		expect(String(unavailableError)).not.toContain("private.example.test");
	});

	it("rejects response metadata that attempts to smuggle media bytes or base64", async () => {
		const adapter = new PrivateMediaHttpAdapter({
			fetcher: async () =>
				jsonResponse({
					asset: {
						id: "asset-1",
						projectId: "project-1",
						status: "ready",
						metadata: { ...METADATA, bytes: "base64-private-payload" },
					},
				}),
		});

		const failure = await adapter
			.finalize({ assetId: "asset-1", idempotencyKey: "finalize-1" }, {})
			.catch((error: unknown) => error);

		expect(failure).toMatchObject({ code: "invalid-response" });
		expect(String(failure)).not.toContain("base64-private-payload");
	});
});

class FakeUploadRequest implements BrowserUploadRequest {
	readonly upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
	status = 0;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	readonly headers: Array<[string, string]> = [];
	method = "";
	url = "";
	body: unknown;
	aborted = false;
	autocomplete = true;

	open(method: string, url: string): void {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(name: string, value: string): void {
		this.headers.push([name, value]);
	}

	send(body: unknown): void {
		this.body = body;
		if (this.autocomplete) {
			this.upload.onprogress?.({ loaded: 2, total: 3, lengthComputable: true } as ProgressEvent);
			this.status = 204;
			this.onload?.();
		}
	}

	abort(): void {
		this.aborted = true;
		this.onabort?.();
	}
}

const SIGNED_UPLOAD: SignedPutContract = {
	method: "PUT",
	url: "https://objects.example.test/signed?secret=query",
	headers: { "content-type": "image/png", "x-amz-meta-owner": "opaque" },
	checksum: { algorithm: "sha256", value: CHECKSUM },
	expiresAt: new Date("2026-08-30T12:15:00.000Z"),
};

const BROWSER_FILE: PrivateMediaFile = {
	name: "cover.png",
	mimeType: "image/png",
	byteSize: 3,
	opaqueHandle: new Blob([new Uint8Array([1, 2, 3])]),
};

describe("browser signed PUT adapter", () => {
	it("puts the opaque file with only and exactly the signed application headers", async () => {
		const request = new FakeUploadRequest();
		const progress: number[] = [];
		const adapter = new BrowserSignedPutAdapter({ createRequest: () => request });

		await adapter.put(BROWSER_FILE, SIGNED_UPLOAD, {
			onProgress: ({ loadedBytes }) => progress.push(loadedBytes),
		});

		expect(request.method).toBe("PUT");
		expect(request.url).toBe(SIGNED_UPLOAD.url);
		expect(request.headers).toEqual([
			["content-type", "image/png"],
			["x-amz-meta-owner", "opaque"],
		]);
		expect(request.body).toBe(BROWSER_FILE.opaqueHandle);
		expect(progress).toEqual([2]);
	});

	it("aborts the active upload and does not leave request handlers installed", async () => {
		const controller = new AbortController();
		const request = new FakeUploadRequest();
		request.autocomplete = false;
		const adapter = new BrowserSignedPutAdapter({ createRequest: () => request });
		const pending = adapter.put(BROWSER_FILE, SIGNED_UPLOAD, { signal: controller.signal });

		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(request.aborted).toBe(true);
		expect(request.onload).toBeNull();
		expect(request.onerror).toBeNull();
		expect(request.onabort).toBeNull();
		expect(request.upload.onprogress).toBeNull();
	});

	it("returns a safe upload error without reflecting the signed URL", async () => {
		const request = new FakeUploadRequest();
		request.autocomplete = false;
		const adapter = new BrowserSignedPutAdapter({ createRequest: () => request });
		const pending = adapter.put(BROWSER_FILE, SIGNED_UPLOAD, {});
		request.status = 403;
		request.onload?.();

		const failure = await pending.catch((error: unknown) => error);

		expect(failure).toMatchObject({ code: "upload-failed", status: 403 });
		expect(String(failure)).not.toContain("secret=query");
	});
});
