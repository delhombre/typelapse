import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { HostedProjectHttpAdapter } from "@/infrastructure/project/hosted-project-http.adapter";
import { describe, expect, it, vi } from "vitest";

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "project-1",
		title: "First story",
		canvas: { width: 1920, height: 1080, background: "mesh:solar" },
		settings: {
			progressStyle: "none",
			transitionMs: 650,
			typewriter: false,
			focusZoom: false,
		},
		assets: [],
		audioCues: [],
		scenes: [
			{
				id: "scene-1",
				durationMs: 1_000,
				blocks: [
					{
						id: "text-1",
						kind: "text",
						text: "Hello",
						typography: {
							fontFamily: "Inter",
							fontSize: 72,
							fontWeight: 700,
							color: "#fff",
							align: "center",
						},
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	},
};

const STORED_PROJECT = {
	id: "project-1",
	ownerId: "account-private",
	revision: 1,
	document: DOCUMENT,
	createdAt: "2026-08-30T19:00:00.000Z",
	updatedAt: "2026-08-30T20:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("hosted project HTTP adapter", () => {
	it("lists owner-scoped summaries through the same-origin projects endpoint", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({
				projects: [
					{
						id: "project-1",
						title: "First story",
						revision: 3,
						sceneCount: 2,
						updatedAt: "2026-08-30T20:00:00.000Z",
					},
				],
			}),
		);
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		await expect(adapter.list()).resolves.toEqual([
			{
				id: "project-1",
				title: "First story",
				revision: 3,
				sceneCount: 2,
				updatedAt: new Date("2026-08-30T20:00:00.000Z"),
			},
		]);
		expect(fetcher).toHaveBeenCalledWith(
			"/api/projects",
			expect.objectContaining({ method: "GET", credentials: "same-origin" }),
		);
	});

	it("creates a V2 document and strips owner identity from the client record", async () => {
		let request: { input: RequestInfo | URL; init?: RequestInit } | null = null;
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			request = { input, init };
			return jsonResponse({ project: STORED_PROJECT }, 201);
		});
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		const created = await adapter.create(DOCUMENT);

		expect(created).toEqual({
			id: "project-1",
			revision: 1,
			document: DOCUMENT,
			createdAt: new Date("2026-08-30T19:00:00.000Z"),
			updatedAt: new Date("2026-08-30T20:00:00.000Z"),
		});
		expect(created).not.toHaveProperty("ownerId");
		expect(request).toMatchObject({
			input: "/api/projects",
			init: {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
			},
		});
		expect(JSON.parse(String((request as { init?: RequestInit } | null)?.init?.body))).toEqual({
			document: DOCUMENT,
		});
	});

	it("loads a V2 record by id and maps an owner-scoped 404 to null", async () => {
		const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ input, init });
			return String(input).endsWith("missing")
				? new Response("account-private must not leak", { status: 404 })
				: jsonResponse({ project: STORED_PROJECT });
		});
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		const loaded = await adapter.load("project-1");
		const missing = await adapter.load("missing");

		expect(loaded).toMatchObject({ id: "project-1", revision: 1, document: DOCUMENT });
		expect(loaded).not.toHaveProperty("ownerId");
		expect(missing).toBeNull();
		expect(requests).toEqual([
			{
				input: "/api/projects/project-1",
				init: expect.objectContaining({ method: "GET", credentials: "same-origin" }),
			},
			{
				input: "/api/projects/missing",
				init: expect.objectContaining({ method: "GET", credentials: "same-origin" }),
			},
		]);
	});

	it("updates optimistically and represents conflict and not-found without throwing", async () => {
		const requests: RequestInit[] = [];
		let responseIndex = 0;
		const responses = [
			jsonResponse({ project: { ...STORED_PROJECT, revision: 2 } }),
			jsonResponse({ error: "Project revision conflict", currentRevision: 2 }, 409),
			new Response("Project not found", { status: 404 }),
		];
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(init ?? {});
			const response = responses[responseIndex];
			responseIndex += 1;
			if (!response) throw new Error("Unexpected request");
			return response;
		});
		const adapter = new HostedProjectHttpAdapter({ fetcher });
		const input = { id: "project-1", expectedRevision: 1, document: DOCUMENT };

		await expect(adapter.update(input)).resolves.toMatchObject({
			outcome: "updated",
			project: { id: "project-1", revision: 2 },
		});
		await expect(adapter.update(input)).resolves.toEqual({
			outcome: "conflict",
			currentRevision: 2,
		});
		await expect(adapter.update(input)).resolves.toEqual({ outcome: "not-found" });
		expect(fetcher).toHaveBeenCalledWith(
			"/api/projects/project-1",
			expect.objectContaining({ method: "PUT", credentials: "same-origin" }),
		);
		expect(JSON.parse(String(requests[0]?.body))).toEqual({
			expectedRevision: 1,
			document: DOCUMENT,
		});
	});

	it("deletes by id and maps an owner-scoped 404 to false", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response("not found", { status: 404 }));
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		await expect(adapter.delete("project-1")).resolves.toBe(true);
		await expect(adapter.delete("project-missing")).resolves.toBe(false);
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			"/api/projects/project-1",
			expect.objectContaining({ method: "DELETE", credentials: "same-origin" }),
		);
	});

	it("reports a delete the server kept because a render is still running", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: "A render is still running", code: "render-active" }), {
				status: 409,
			}),
		);
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		await expect(adapter.delete("project-1")).rejects.toMatchObject({
			code: "render-active",
			status: 409,
		});
	});

	it("rejects non-V2 or non-exact records without reflecting response details", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					project: {
						...STORED_PROJECT,
						document: {
							...DOCUMENT,
							project: { ...DOCUMENT.project, syncToken: "private-project-token" },
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					projects: [
						{
							id: "project-1",
							title: "First story",
							revision: 1,
							sceneCount: 1,
							updatedAt: "2026-08-30T20:00:00.000Z",
							ownerId: "account-private",
						},
					],
				}),
			);
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		const recordFailure = await adapter.load("project-1").catch((error: unknown) => error);
		const summaryFailure = await adapter.list().catch((error: unknown) => error);

		expect(recordFailure).toMatchObject({ code: "invalid-response" });
		expect(summaryFailure).toMatchObject({ code: "invalid-response" });
		expect(String(recordFailure)).not.toContain("private-project-token");
		expect(String(summaryFailure)).not.toContain("account-private");
	});

	it("asks whether a project exists with a GET that answers 200 either way", async () => {
		const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ input, init });
			return jsonResponse({ exists: !String(input).includes("missing") });
		});
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		expect(await adapter.exists("project-1")).toBe(true);
		expect(await adapter.exists("missing/one")).toBe(false);
		expect(requests).toEqual([
			{
				input: "/api/projects/project-1/exists",
				init: expect.objectContaining({ method: "GET", credentials: "same-origin" }),
			},
			{
				input: "/api/projects/missing%2Fone/exists",
				init: expect.objectContaining({ method: "GET", credentials: "same-origin" }),
			},
		]);
	});

	it("refuses an existence answer that is not exactly { exists: boolean }, and a sign-in wall", async () => {
		const answering = (body: unknown, status = 200) =>
			new HostedProjectHttpAdapter({ fetcher: async () => jsonResponse(body, status) });

		await expect(answering({ exists: "yes" }).exists("project-1")).rejects.toMatchObject({
			code: "invalid-response",
		});
		await expect(
			answering({ exists: true, ownerId: "x" }).exists("project-1"),
		).rejects.toMatchObject({ code: "invalid-response" });
		await expect(answering({ error: "Sign in" }, 401).exists("project-1")).rejects.toMatchObject({
			code: "unauthorized",
		});
	});

	it("maps authentication and transport failures to safe non-reflective errors", async () => {
		const unauthorized = new HostedProjectHttpAdapter({
			fetcher: async () => new Response("session token=private", { status: 401 }),
		});
		const unavailable = new HostedProjectHttpAdapter({
			fetcher: async () => {
				throw new Error("postgres://secret@private.example.test");
			},
		});

		const authFailure = await unauthorized.list().catch((error: unknown) => error);
		const networkFailure = await unavailable.list().catch((error: unknown) => error);

		expect(authFailure).toMatchObject({ code: "unauthorized", status: 401 });
		expect(networkFailure).toMatchObject({ code: "unavailable" });
		expect(String(authFailure)).not.toContain("token=private");
		expect(String(networkFailure)).not.toContain("private.example.test");
	});

	it("propagates AbortSignal and checks pre-abort before every HTTP effect", async () => {
		const controller = new AbortController();
		let receivedSignal: AbortSignal | null | undefined;
		const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			receivedSignal = init?.signal;
			return jsonResponse({ projects: [] });
		});
		const adapter = new HostedProjectHttpAdapter({ fetcher });

		await adapter.list({ signal: controller.signal });
		expect(receivedSignal).toBe(controller.signal);

		controller.abort();
		await expect(adapter.list({ signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it("rejects an unexpected success status instead of guessing a wire contract", async () => {
		const adapter = new HostedProjectHttpAdapter({
			fetcher: async () => jsonResponse({ project: STORED_PROJECT }, 202),
		});

		await expect(adapter.create(DOCUMENT)).rejects.toMatchObject({
			code: "invalid-response",
		});
	});

	it("refuses a cross-origin endpoint configuration without reflecting it", () => {
		const failure = (() => {
			try {
				return new HostedProjectHttpAdapter({
					basePath: "https://private.example.test/api/projects?token=secret",
				});
			} catch (error) {
				return error;
			}
		})();

		expect(failure).toMatchObject({ code: "rejected" });
		expect(String(failure)).not.toContain("private.example.test");
	});
});
