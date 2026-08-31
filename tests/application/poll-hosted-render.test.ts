import type {
	HostedRenderClientPort,
	HostedRenderJobSnapshot,
} from "@/application/render/hosted-render-client.port";
import {
	HostedRenderAbortedError,
	HostedRenderJobFailedError,
	waitForHostedRender,
} from "@/application/render/poll-hosted-render";
import { describe, expect, it, vi } from "vitest";

const job = (
	status: HostedRenderJobSnapshot["status"],
	errorCode?: string,
): HostedRenderJobSnapshot => ({
	id: "job-1",
	projectId: "project-1",
	revision: 2,
	status,
	createdAt: "2026-08-31T08:00:00.000Z",
	completedAt: status === "succeeded" || status === "failed" ? "2026-08-31T08:00:10.000Z" : null,
	...(errorCode ? { errorCode } : {}),
});

function client(states: readonly HostedRenderJobSnapshot[]): HostedRenderClientPort {
	if (states.length === 0) {
		throw new Error("A fake hosted render client needs at least one state");
	}
	let index = 0;
	return {
		submit: vi.fn(),
		status: vi.fn(async () => {
			const state = states[Math.min(index++, states.length - 1)];
			if (!state) {
				throw new Error("Missing fake hosted render state");
			}
			return { job: state };
		}),
		download: vi.fn(async () => ({
			method: "GET" as const,
			url: "https://private.example.test/render",
			expiresAt: "2026-08-31T08:02:00.000Z",
			mimeType: "video/mp4",
			byteSize: 42,
		})),
	};
}

describe("waitForHostedRender", () => {
	it("polls queued and running jobs, then refreshes a missing signed download", async () => {
		const remote = client([job("queued"), job("running"), job("succeeded")]);
		const sleep = vi.fn(async () => undefined);

		const result = await waitForHostedRender(remote, "job-1", {
			intervalMs: 1,
			timeoutMs: 1_000,
			sleep,
		});

		expect(result.job.status).toBe("succeeded");
		expect(result.download.url).toContain("private.example.test");
		expect(remote.status).toHaveBeenCalledTimes(3);
		expect(remote.download).toHaveBeenCalledWith("job-1", expect.any(Object));
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("surfaces a durable render failure with its server code", async () => {
		const remote = client([job("failed", "renderer-invalid-output")]);

		const error = await waitForHostedRender(remote, "job-1").catch((reason) => reason);
		expect(error).toBeInstanceOf(HostedRenderJobFailedError);
		expect(error).toMatchObject({ renderCode: "renderer-invalid-output" });
	});

	it("aborts while waiting without issuing another status request", async () => {
		const remote = client([job("queued"), job("running")]);
		const controller = new AbortController();
		const sleep = vi.fn(async (_ms: number, signal: AbortSignal) => {
			controller.abort("panel-closed");
			if (signal.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}
		});

		const error = await waitForHostedRender(remote, "job-1", {
			signal: controller.signal,
			intervalMs: 1,
			sleep,
		}).catch((reason) => reason);

		expect(error).toBeInstanceOf(HostedRenderAbortedError);
		expect(remote.status).toHaveBeenCalledTimes(1);
	});
});
