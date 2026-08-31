import {
	HostedRenderHttpAdapter,
	HostedRenderHttpError,
} from "@/infrastructure/export/hosted-render-http.adapter";
import { describe, expect, it, vi } from "vitest";

const request = {
	projectId: "project-1",
	revision: 7,
	renderOptions: {
		format: "mp4" as const,
		width: 1920,
		height: 1080,
		fps: 30 as const,
		includeAudio: true,
	},
};

const queuedJob = {
	id: "job-1",
	projectId: "project-1",
	revision: 7,
	status: "queued",
	createdAt: "2026-08-31T08:00:00.000Z",
	completedAt: null,
};

describe("HostedRenderHttpAdapter", () => {
	it("submits the canonical V2 request without client-authored entitlement headers", async () => {
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(JSON.stringify({ job: queuedJob }), {
					status: 202,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const adapter = new HostedRenderHttpAdapter({ fetcher, baseUrl: "/api/cloud" });
		const signal = new AbortController().signal;

		await expect(adapter.submit(request, { signal })).resolves.toEqual(queuedJob);
		expect(fetcher).toHaveBeenCalledWith(
			"/api/cloud/render",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				signal,
				body: JSON.stringify(request),
			}),
		);
		const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
		expect(headers.get("Content-Type")).toBe("application/json");
		expect(headers.get("x-typelapse-plan")).toBeNull();
	});

	it("reads job state and its private signed download", async () => {
		const succeededJob = {
			...queuedJob,
			status: "succeeded",
			completedAt: "2026-08-31T08:00:20.000Z",
		};
		const download = {
			method: "GET",
			url: "https://private.example.test/signed",
			expiresAt: "2026-08-31T08:01:20.000Z",
			mimeType: "video/mp4",
			byteSize: 420,
		};
		const fetcher = vi
			.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response())
			.mockResolvedValueOnce(Response.json({ job: succeededJob, download }))
			.mockResolvedValueOnce(Response.json({ download }));
		const adapter = new HostedRenderHttpAdapter({ fetcher, baseUrl: "/api/cloud" });

		await expect(adapter.status("job-1")).resolves.toEqual({
			job: succeededJob,
			download,
		});
		await expect(adapter.download("job-1")).resolves.toEqual(download);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			"/api/cloud/jobs/job-1/download",
			expect.objectContaining({ credentials: "include" }),
		);
	});

	it("maps conflicts into a typed error with server details", async () => {
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(JSON.stringify({ error: "Project revision conflict", currentRevision: 9 }), {
					status: 409,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const adapter = new HostedRenderHttpAdapter({ fetcher });

		const error = await adapter.submit(request).catch((reason) => reason);
		expect(error).toBeInstanceOf(HostedRenderHttpError);
		expect(error).toMatchObject({
			code: "conflict",
			status: 409,
			retryable: false,
			currentRevision: 9,
		});
	});

	it("rejects malformed success payloads instead of inventing a job", async () => {
		const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({ job: { id: "job-1" } }),
		);
		const adapter = new HostedRenderHttpAdapter({ fetcher });

		await expect(adapter.submit(request)).rejects.toMatchObject({
			code: "invalid-response",
			retryable: false,
		});
	});
});
