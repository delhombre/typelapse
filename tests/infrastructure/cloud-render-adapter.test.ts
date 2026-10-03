import type { CloudRenderRequest } from "@/domain/ports/cloud-export.port";
import { CloudRenderAdapter } from "@/infrastructure/export/cloud-render.adapter";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("CloudRenderAdapter", () => {
	it("sends the render request and nothing that claims a plan", async () => {
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(JSON.stringify({ jobId: "job-1", status: "queued" }), { status: 202 }),
		);
		vi.stubGlobal("fetch", fetcher);

		await new CloudRenderAdapter().submitRender({ title: "Demo" } as CloudRenderRequest);

		// The server resolves the plan from the session; the client asserts nothing.
		const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
		expect([...headers.keys()]).toEqual(["content-type"]);
	});
});
