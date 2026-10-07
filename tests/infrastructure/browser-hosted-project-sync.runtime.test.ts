import type { PrivateAssetApiPort } from "@/application/assets/private-media-upload.port";
import type { UploadPrivateMedia } from "@/application/assets/upload-private-media";
import type {
	HostedProjectApiPort,
	HostedProjectRecord,
} from "@/application/project/hosted-project-api.port";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { createBrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-08-31T08:00:00.000Z");

function document(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Media story",
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

function record(value = document(), revision = 1): HostedProjectRecord {
	return {
		id: value.project.id,
		revision,
		document: value,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

describe("browser hosted project sync runtime", () => {
	it("unwraps File only for the private uploader and keeps it out of the hosted document", async () => {
		const update = vi.fn(async (input: Parameters<HostedProjectApiPort["update"]>[0]) => ({
			outcome: "updated" as const,
			project: record(input.document, input.expectedRevision + 1),
		}));
		const api: HostedProjectApiPort = {
			list: async () => [],
			exists: async () => false,
			create: async (value) => record(value),
			load: async () => record(),
			update,
			delete: async () => false,
		};
		const assets: PrivateAssetApiPort = {
			reserve: async () => {
				throw new Error("Unexpected reserve");
			},
			finalize: async () => {
				throw new Error("Unexpected finalize");
			},
			resolveContent: async () => {
				throw new Error("Unexpected resolve");
			},
		};
		let receivedHandle: unknown;
		const uploader: UploadPrivateMedia = {
			execute: async ({ file, projectId }) => {
				receivedHandle = file.opaqueHandle;
				return {
					asset: {
						id: "asset-1",
						projectId,
						status: "ready",
						metadata: {
							kind: "image",
							fileName: file.name,
							mimeType: file.mimeType,
							byteSize: file.byteSize,
							checksum: "a".repeat(64),
							width: 1,
							height: 1,
						},
					},
					access: {
						method: "GET",
						url: "https://private.example.test/asset-1?signature=secret",
						expiresAt: new Date("2026-08-31T08:15:00.000Z"),
					},
				};
			},
		};
		const runtime = createBrowserHostedProjectSyncRuntime(
			{ registry: createSceneAssetSourceRegistry(), api, assets, uploader },
			{ now: () => NOW },
		);
		await runtime.connect({
			session: {
				account: { id: "account-1", email: "creator@example.test", name: "Creator" },
				expiresAt: new Date("2026-08-31T09:00:00.000Z"),
			},
			localDocument: document(),
			hostedProjectId: "project-1",
		});
		const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });

		await runtime.importFile(file);

		expect(receivedHandle).toBe(file);
		const persisted = update.mock.calls[0]?.[0].document;
		expect(JSON.stringify(persisted)).not.toContain("opaqueHandle");
		expect(JSON.stringify(persisted)).not.toContain("private.example.test");
	});
});
