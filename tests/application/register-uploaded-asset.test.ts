import type { UploadedPrivateMedia } from "@/application/assets/upload-private-media";
import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { registerUploadedAsset } from "@/application/project/register-uploaded-asset";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { describe, expect, it } from "vitest";

const DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "project-1",
		title: "Media story",
		canvas: { width: 1920, height: 1080, background: "#111" },
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
						text: "Add media",
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

function uploaded(overrides: Partial<UploadedPrivateMedia["asset"]> = {}): UploadedPrivateMedia {
	return {
		asset: {
			id: "asset-1",
			projectId: "project-1",
			status: "ready",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 100,
				checksum: "a".repeat(64),
				width: 1600,
				height: 900,
			},
			...overrides,
		},
		access: {
			method: "GET",
			url: "https://private.example.test/asset?signature=secret",
			expiresAt: new Date("2026-08-30T23:59:00.000Z"),
		},
	};
}

describe("registerUploadedAsset", () => {
	it("registers only ready canonical metadata and never serializes private access", () => {
		const hydrated = hydrateProjectDocument(DOCUMENT);

		const project = registerUploadedAsset(hydrated.project, uploaded());
		const serialized = serializeProjectDocument({ ...hydrated, project });

		expect(serialized.project.assets).toEqual([
			{
				id: "asset-1",
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 100,
				checksum: "a".repeat(64),
				width: 1600,
				height: 900,
			},
		]);
		expect(JSON.stringify(serialized)).not.toContain("private.example.test");
		expect(JSON.stringify(serialized)).not.toContain("signature");
	});

	it("rejects pending or cross-project upload results before mutating the aggregate", () => {
		const project = hydrateProjectDocument(DOCUMENT).project;

		expect(() => registerUploadedAsset(project, uploaded({ status: "pending" }))).toThrow(
			"Uploaded asset is not ready",
		);
		expect(() =>
			registerUploadedAsset(project, uploaded({ projectId: "project-foreign" })),
		).toThrow("Uploaded asset belongs to another project");
		expect(project.assets).toEqual([]);
	});
});
