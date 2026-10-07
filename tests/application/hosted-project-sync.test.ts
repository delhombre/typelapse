import type {
	PrivateAssetApiPort,
	PrivateAssetSnapshot,
	PrivateMediaFile,
} from "@/application/assets/private-media-upload.port";
import type { UploadPrivateMedia } from "@/application/assets/upload-private-media";
import type { ClientSession } from "@/application/auth/client-auth.port";
import {
	HostedProjectApiError,
	type HostedProjectApiPort,
	type HostedProjectRecord,
} from "@/application/project/hosted-project-api.port";
import {
	HostedProjectSyncError,
	createHostedProjectSyncCoordinator,
} from "@/application/project/hosted-project-sync";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-08-31T08:00:00.000Z");
const SESSION: ClientSession = {
	account: { id: "account-1", email: "creator@example.test", name: "Creator" },
	expiresAt: new Date("2026-08-31T09:00:00.000Z"),
};
const FILE: PrivateMediaFile = {
	name: "cover.png",
	mimeType: "image/png",
	byteSize: 42,
	opaqueHandle: { browserFile: true },
};
const ASSET: PrivateAssetSnapshot = {
	id: "asset-1",
	projectId: "hosted-project-1",
	status: "ready",
	metadata: {
		kind: "image",
		fileName: "cover.png",
		mimeType: "image/png",
		byteSize: 42,
		checksum: "a".repeat(64),
		width: 1200,
		height: 630,
	},
};

function document(id = "local-project-1", title = "Story"): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id,
			title,
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
								fontSize: 64,
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
}

function record(
	revision = 1,
	value: ProjectDocumentV2 = document("hosted-project-1"),
): HostedProjectRecord {
	return {
		id: value.project.id,
		revision,
		document: value,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function apiWith(overrides: Partial<HostedProjectApiPort> = {}): HostedProjectApiPort {
	return {
		list: vi.fn(async () => []),
		exists: vi.fn(async () => false),
		create: vi.fn(async (value) =>
			record(1, { ...value, project: { ...value.project, id: "hosted-project-1" } }),
		),
		load: vi.fn(async () => null),
		update: vi.fn(async (input) => ({
			outcome: "updated" as const,
			project: record(input.expectedRevision + 1, input.document),
		})),
		delete: vi.fn(async () => false),
		...overrides,
	};
}

function assetApiWith(overrides: Partial<PrivateAssetApiPort> = {}): PrivateAssetApiPort {
	return {
		reserve: vi.fn(async () => {
			throw new Error("Unexpected reserve");
		}),
		finalize: vi.fn(async () => {
			throw new Error("Unexpected finalize");
		}),
		resolveContent: vi.fn(async ({ assetId }) => ({
			method: "GET" as const,
			url: `https://private.example.test/${assetId}?signature=secret`,
			expiresAt: new Date("2026-08-31T08:15:00.000Z"),
		})),
		...overrides,
	};
}

function uploaderWith(
	execute: UploadPrivateMedia["execute"] = vi.fn(async () => ({
		asset: ASSET,
		access: {
			method: "GET" as const,
			url: "https://private.example.test/asset-1?signature=secret",
			expiresAt: new Date("2026-08-31T08:15:00.000Z"),
		},
	})),
): UploadPrivateMedia {
	return { execute };
}

function createHarness(
	input: {
		api?: HostedProjectApiPort;
		assets?: PrivateAssetApiPort;
		uploader?: UploadPrivateMedia;
	} = {},
) {
	const registry = createSceneAssetSourceRegistry();
	const api = input.api ?? apiWith();
	const assets = input.assets ?? assetApiWith();
	const uploader = input.uploader ?? uploaderWith();
	const coordinator = createHostedProjectSyncCoordinator(
		{ api, assets, uploader, registry },
		{ debounceMs: 250, now: () => NOW },
	);
	return { coordinator, api, assets, uploader, registry };
}

describe("hosted project sync coordinator", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("does not touch hosted persistence before a live authenticated session exists", async () => {
		const api = apiWith();
		const { coordinator } = createHarness({ api });

		await expect(
			coordinator.connect({ session: null, localDocument: document() }),
		).rejects.toMatchObject({ code: "authentication-required" });
		await expect(
			coordinator.connect({
				session: { ...SESSION, expiresAt: new Date("2026-08-31T07:59:59.000Z") },
				localDocument: document(),
			}),
		).rejects.toMatchObject({ code: "session-expired" });
		expect(api.load).not.toHaveBeenCalled();
		expect(api.create).not.toHaveBeenCalled();
	});

	it("loads the exact owner-scoped project and hydrates private sources outside its document", async () => {
		const hosted = document("hosted-project-1");
		hosted.project.assets = [{ id: ASSET.id, ...ASSET.metadata }];
		const api = apiWith({ load: vi.fn(async () => record(4, hosted)) });
		const assets = assetApiWith();
		const { coordinator, registry } = createHarness({ api, assets });

		const connected = await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});

		expect(connected).toEqual({ project: record(4, hosted), loaded: true });
		expect(api.load).toHaveBeenCalledWith("hosted-project-1", {
			signal: expect.any(AbortSignal),
		});
		expect(api.create).not.toHaveBeenCalled();
		expect(registry.resolve("asset-1")?.src).toContain("signature=secret");
		expect(JSON.stringify(connected.project.document)).not.toContain("private.example.test");
		expect(coordinator.getState()).toMatchObject({
			kind: "ready",
			projectId: "hosted-project-1",
			revision: 4,
		});
	});

	it("opens the cloud copy a local project already has, found by asking whether its id exists", async () => {
		const hosted = document("local-project-1", "Cloud copy");
		const api = apiWith({
			exists: vi.fn(async () => true),
			load: vi.fn(async () => record(2, hosted)),
		});
		const { coordinator } = createHarness({ api });

		const connected = await coordinator.connect({ session: SESSION, localDocument: document() });

		expect(connected).toMatchObject({ loaded: true });
		expect(api.exists).toHaveBeenCalledWith("local-project-1", {
			signal: expect.any(AbortSignal),
		});
		expect(api.load).toHaveBeenCalledWith("local-project-1", {
			signal: expect.any(AbortSignal),
		});
		expect(api.create).not.toHaveBeenCalled();
		expect(api.list).not.toHaveBeenCalled();
	});

	it("does not ask when the project names its cloud copy: a 404 there means it is gone", async () => {
		const api = apiWith();
		const { coordinator } = createHarness({ api });

		await expect(
			coordinator.connect({
				session: SESSION,
				localDocument: document(),
				hostedProjectId: "hosted-project-1",
			}),
		).rejects.toMatchObject({ code: "project-not-found" });

		expect(api.exists).not.toHaveBeenCalled();
		expect(api.list).not.toHaveBeenCalled();
		expect(api.load).toHaveBeenCalledOnce();
	});

	it("creates the project when the cloud has no copy, and leaves nothing in the console", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const api = apiWith({ exists: vi.fn(async () => false) });
		const { coordinator } = createHarness({ api });

		const connected = await coordinator.connect({ session: SESSION, localDocument: document() });

		expect(connected.loaded).toBe(false);
		expect(api.create).toHaveBeenCalledOnce();
		expect(api.load).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
		logged.mockRestore();
	});

	it("surfaces the existence question's failure instead of creating a second copy", async () => {
		const api = apiWith({
			exists: vi.fn(async () => {
				throw new HostedProjectApiError("unavailable", "down");
			}),
		});
		const { coordinator } = createHarness({ api });

		await expect(
			coordinator.connect({ session: SESSION, localDocument: document() }),
		).rejects.toMatchObject({ code: "service-unavailable" });
		expect(api.create).not.toHaveBeenCalled();
	});

	it("creates a canonical media-free hosted project, but refuses to fake-migrate local blobs", async () => {
		const api = apiWith();
		const { coordinator } = createHarness({ api });

		const connected = await coordinator.connect({
			session: SESSION,
			localDocument: document(),
		});
		expect(connected.loaded).toBe(false);
		// A project the cloud has never seen is found out from the existence
		// endpoint, which answers 200 either way: a GET on its id would answer 404,
		// and the browser logs that as an error. It is not the list, which reads and
		// validates every project the account owns.
		expect(api.exists).toHaveBeenCalledOnce();
		expect(api.list).not.toHaveBeenCalled();
		expect(api.load).not.toHaveBeenCalled();
		expect(api.create).toHaveBeenCalledOnce();

		coordinator.stop();
		const another = createHarness({ api: apiWith() });
		const unsafe = document();
		unsafe.project.canvas.background = "blob:https://app.example.test/private";

		await expect(
			another.coordinator.connect({ session: SESSION, localDocument: unsafe }),
		).rejects.toMatchObject({ code: "invalid-document" });
		expect(another.api.load).not.toHaveBeenCalled();
		expect(another.api.create).not.toHaveBeenCalled();
	});

	it("debounces canonical writes, skips identical documents, and advances the server revision", async () => {
		const api = apiWith({ load: vi.fn(async () => record(7)) });
		const { coordinator } = createHarness({ api });
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});

		const first = document("hosted-project-1", "First edit");
		const latest = document("hosted-project-1", "Latest edit");
		coordinator.scheduleSave(first);
		coordinator.scheduleSave(latest);
		coordinator.scheduleSave(latest);
		expect(api.update).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(249);
		expect(api.update).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await coordinator.flush();

		expect(api.update).toHaveBeenCalledOnce();
		expect(api.update).toHaveBeenCalledWith(
			{
				id: "hosted-project-1",
				expectedRevision: 7,
				document: latest,
			},
			{ signal: expect.any(AbortSignal) },
		);
		expect(coordinator.getState()).toMatchObject({ kind: "ready", revision: 8 });

		coordinator.scheduleSave(latest);
		await vi.advanceTimersByTimeAsync(250);
		await coordinator.flush();
		expect(api.update).toHaveBeenCalledOnce();
	});

	it("treats a jsonb echo with reordered keys as saved and issues no extra revision", async () => {
		const reorder = (value: unknown): unknown => {
			if (Array.isArray(value)) return value.map(reorder);
			if (value === null || typeof value !== "object") return value;
			const reversed: Record<string, unknown> = {};
			for (const key of Object.keys(value).reverse()) {
				reversed[key] = reorder((value as Record<string, unknown>)[key]);
			}
			return reversed;
		};
		const api = apiWith({
			load: vi.fn(async () =>
				record(3, reorder(document("hosted-project-1")) as ProjectDocumentV2),
			),
			update: vi.fn(async (input) => ({
				outcome: "updated" as const,
				project: record(input.expectedRevision + 1, reorder(input.document) as ProjectDocumentV2),
			})),
		});
		const { coordinator } = createHarness({ api });
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});

		coordinator.scheduleSave(document("hosted-project-1"));
		await coordinator.flush();
		expect(api.update).not.toHaveBeenCalled();

		const edited = document("hosted-project-1", "Edited");
		coordinator.scheduleSave(edited);
		await coordinator.flush();
		coordinator.scheduleSave(edited);
		await coordinator.flush();

		expect(api.update).toHaveBeenCalledOnce();
		expect(coordinator.getState()).toMatchObject({ kind: "ready", revision: 4 });
	});

	it("surfaces an optimistic concurrency conflict and never retries it", async () => {
		const update = vi.fn(async () => ({ outcome: "conflict" as const, currentRevision: 12 }));
		const api = apiWith({ load: vi.fn(async () => record(9)), update });
		const { coordinator } = createHarness({ api });
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});
		coordinator.scheduleSave(document("hosted-project-1", "Conflicting edit"));

		const result = await coordinator.flush();

		expect(result).toEqual({ outcome: "conflict", currentRevision: 12 });
		expect(update).toHaveBeenCalledOnce();
		expect(coordinator.getState()).toEqual({
			kind: "conflict",
			projectId: "hosted-project-1",
			localRevision: 9,
			currentRevision: 12,
		});
		expect(() => coordinator.scheduleSave(document("hosted-project-1", "Another"))).toThrow(
			HostedProjectSyncError,
		);
	});

	it("treats an owner-scoped not-found as terminal instead of silently recreating or retrying", async () => {
		const update = vi.fn(async () => ({ outcome: "not-found" as const }));
		const api = apiWith({ load: vi.fn(async () => record(3)), update });
		const { coordinator } = createHarness({ api });
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});
		coordinator.scheduleSave(document("hosted-project-1", "Missing project edit"));

		await expect(coordinator.flush()).resolves.toEqual({ outcome: "not-found" });
		expect(coordinator.getState()).toEqual({
			kind: "missing",
			projectId: "hosted-project-1",
		});
		expect(() => coordinator.scheduleSave(document("hosted-project-1", "Retry"))).toThrow(
			expect.objectContaining({ code: "project-not-found" }),
		);
		expect(update).toHaveBeenCalledOnce();
	});

	it("uploads a browser-owned file privately, saves only its canonical metadata, then exposes signed access ephemerally", async () => {
		const update = vi.fn(async (input: Parameters<HostedProjectApiPort["update"]>[0]) => ({
			outcome: "updated" as const,
			project: record(input.expectedRevision + 1, input.document),
		}));
		const api = apiWith({ load: vi.fn(async () => record(2)), update });
		const execute = vi.fn(uploaderWith().execute);
		const { coordinator, registry } = createHarness({
			api,
			uploader: uploaderWith(execute),
		});
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});

		const imported = await coordinator.importMedia(FILE);

		expect(imported.outcome).toBe("imported");
		expect(execute).toHaveBeenCalledWith(
			{ file: FILE, projectId: "hosted-project-1" },
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(update).toHaveBeenCalledOnce();
		const persisted = update.mock.calls[0]?.[0].document;
		expect(persisted?.project.assets).toEqual([{ id: ASSET.id, ...ASSET.metadata }]);
		expect(JSON.stringify(persisted)).not.toContain("opaqueHandle");
		expect(JSON.stringify(persisted)).not.toContain("private.example.test");
		expect(JSON.stringify(persisted)).not.toContain("signature");
		expect(registry.resolve("asset-1")?.src).toContain("signature=secret");
	});

	it("does not register a signed source when the metadata attachment conflicts", async () => {
		const api = apiWith({
			load: vi.fn(async () => record(2)),
			update: vi.fn(async () => ({ outcome: "conflict" as const, currentRevision: 3 })),
		});
		const { coordinator, registry } = createHarness({ api });
		await coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});

		await expect(coordinator.importMedia(FILE)).resolves.toEqual({
			outcome: "conflict",
			currentRevision: 3,
		});
		expect(registry.resolve("asset-1")).toBeNull();
		expect(coordinator.getState()).toMatchObject({ kind: "conflict", currentRevision: 3 });
	});

	it("aborts in-flight work and revokes ephemeral sources when stopped", async () => {
		let releaseLoad: (value: HostedProjectRecord | null) => void = () => undefined;
		let receivedSignal: AbortSignal | undefined;
		const api = apiWith({
			load: vi.fn(
				(_id, options) =>
					new Promise<HostedProjectRecord | null>((resolve) => {
						receivedSignal = options?.signal;
						releaseLoad = resolve;
					}),
			),
		});
		const { coordinator, registry } = createHarness({ api });
		registry.register({
			source: { assetId: "temporary", src: "blob:temporary" },
			release: vi.fn(),
		});
		const connecting = coordinator.connect({
			session: SESSION,
			localDocument: document(),
			hostedProjectId: "hosted-project-1",
		});
		await Promise.resolve();

		coordinator.stop();
		expect(receivedSignal?.aborted).toBe(true);
		expect(registry.resolve("temporary")).toBeNull();
		releaseLoad(record());
		await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
		expect(coordinator.getState()).toEqual({ kind: "stopped" });
	});
});
