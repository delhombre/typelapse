import { CloudRenderAdapter } from "@/infrastructure/export/cloud-render.adapter";
import { describe, expect, it, vi } from "vitest";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function answering(status: number, body: unknown): ReturnType<typeof vi.fn<Fetcher>> {
	return vi.fn<Fetcher>(async () => new Response(JSON.stringify(body), { status }));
}

const OPTIONS = { format: "mp4", width: 1920, height: 1080, fps: 60, includeAudio: true } as const;

const SUCCEEDED = {
	job: {
		id: "job-1",
		projectId: "project-1",
		revision: 3,
		status: "succeeded",
		createdAt: "2026-10-03T10:00:00.000Z",
		completedAt: "2026-10-03T10:00:40.000Z",
	},
	download: {
		method: "GET",
		url: "https://storage.example.test/signed",
		expiresAt: "2026-10-03T10:01:40.000Z",
		mimeType: "video/mp4",
		byteSize: 4096,
	},
};

describe("CloudRenderAdapter", () => {
	it("posts the saved revision and the options, and nothing that claims a plan", async () => {
		const fetcher = answering(202, { job: { ...SUCCEEDED.job, status: "queued" } });

		const result = await new CloudRenderAdapter(fetcher).submit({
			projectId: "project-1",
			revision: 3,
			renderOptions: { ...OPTIONS, loop: true },
		});

		expect(result).toEqual({
			kind: "accepted",
			job: { id: "job-1", status: "queued", download: null },
		});
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("/api/cloud/render");
		expect(init?.method).toBe("POST");
		expect(init?.credentials).toBe("include");
		// The server resolves the plan from the session; the client asserts nothing.
		expect([...new Headers(init?.headers).keys()]).toEqual(["content-type"]);
		expect(JSON.parse(String(init?.body))).toEqual({
			projectId: "project-1",
			revision: 3,
			renderOptions: { ...OPTIONS, loop: true },
		});
	});

	it("hands back the server's 402 sentence and the plan that lifts it", async () => {
		const fetcher = answering(402, {
			error: "Hosted renders come with Creator",
			code: "plan-limit",
			ceiling: "hostedRenderTime",
			limit: 0,
			used: 0,
			plan: "free",
			upgradeTo: "creator",
		});

		const result = await new CloudRenderAdapter(fetcher).submit({ renderOptions: OPTIONS });

		expect(result).toEqual({
			kind: "refused",
			status: 402,
			message: "Hosted renders come with Creator",
			code: "plan-limit",
			upgradeTo: "creator",
		});
	});

	it("reads a succeeded job with its signed download", async () => {
		const result = await new CloudRenderAdapter(answering(200, SUCCEEDED)).job("job-1");

		expect(result).toEqual({
			kind: "found",
			job: {
				id: "job-1",
				status: "succeeded",
				download: {
					url: "https://storage.example.test/signed",
					expiresAt: "2026-10-03T10:01:40.000Z",
					mimeType: "video/mp4",
					byteSize: 4096,
				},
			},
		});
	});

	it("escapes the job id in the path", async () => {
		const fetcher = answering(404, { error: "Render job not found" });

		const result = await new CloudRenderAdapter(fetcher).job("../billing");

		expect(fetcher.mock.calls[0]?.[0]).toBe("/api/cloud/jobs/..%2Fbilling");
		expect(result).toEqual({ kind: "not-found" });
	});

	it("says unreachable when the API is down or answers something it cannot read", async () => {
		const down = vi.fn<Fetcher>(async () => {
			throw new TypeError("Failed to fetch");
		});
		const garbled = answering(200, { job: { id: 4 } });
		const restarting = new CloudRenderAdapter(
			vi.fn<Fetcher>(async () => new Response("Bad gateway", { status: 502 })),
		);

		expect(await new CloudRenderAdapter(down).job("job-1")).toEqual({ kind: "unreachable" });
		expect(await new CloudRenderAdapter(garbled).job("job-1")).toEqual({ kind: "unreachable" });
		expect(await restarting.job("job-1")).toEqual({ kind: "unreachable" });
	});

	it("refreshes a download link and passes on the grace period's refusal", async () => {
		const fresh = await new CloudRenderAdapter(
			answering(200, { download: SUCCEEDED.download }),
		).download("job-1");
		const expired = await new CloudRenderAdapter(
			answering(402, {
				error: "Free keeps past hosted renders for 30 days; Creator keeps them",
				code: "output-expired",
				plan: "free",
				upgradeTo: "creator",
			}),
		).download("job-1");

		expect(fresh).toMatchObject({ kind: "ready", download: { mimeType: "video/mp4" } });
		expect(expired).toEqual({
			kind: "refused",
			status: 402,
			message: "Free keeps past hosted renders for 30 days; Creator keeps them",
			code: "output-expired",
			upgradeTo: "creator",
		});
	});

	it("reads the allowance sentence and whether the plan includes hosted renders", async () => {
		const allowance = (minutes: number) =>
			answering(200, {
				allowance: {
					plan: minutes ? "creator" : "free",
					sentence: "You are using 1 of 3 cloud projects.",
					limits: {
						cloudProjects: 3,
						mediaBytes: 1,
						hostedRenderTime: minutes,
						concurrentRenders: 0,
					},
					usage: {},
				},
			});

		expect(await new CloudRenderAdapter(allowance(0)).allowance()).toEqual({
			kind: "ok",
			allowance: { sentence: "You are using 1 of 3 cloud projects.", hostedRenders: false },
		});
		expect(await new CloudRenderAdapter(allowance(3_600_000)).allowance()).toMatchObject({
			allowance: { hostedRenders: true },
		});
	});
});
