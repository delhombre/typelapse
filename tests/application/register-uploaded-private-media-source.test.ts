import { registerUploadedPrivateMediaSource } from "@/application/assets/register-uploaded-private-media-source";
import type { UploadedPrivateMedia } from "@/application/assets/upload-private-media";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { describe, expect, it } from "vitest";

function uploaded(
	url = "https://objects.example.test/private?signature=secret",
): UploadedPrivateMedia {
	return {
		asset: {
			id: "asset-hosted-1",
			projectId: "project-1",
			status: "ready",
			metadata: {
				kind: "image",
				fileName: "cover.png",
				mimeType: "image/png",
				byteSize: 42,
				checksum: "c".repeat(64),
				width: 1200,
				height: 630,
			},
		},
		access: {
			method: "GET",
			url,
			expiresAt: new Date("2026-08-31T00:30:00.000Z"),
		},
	};
}

describe("register uploaded private media source", () => {
	it("registers signed GET access as a replaceable runtime source without mutating the Asset", () => {
		const registry = createSceneAssetSourceRegistry();
		const firstUpload = uploaded();
		const assetBefore = JSON.stringify(firstUpload.asset);

		registerUploadedPrivateMediaSource(registry, firstUpload);
		registerUploadedPrivateMediaSource(
			registry,
			uploaded("https://objects.example.test/refreshed?signature=new"),
		);

		expect(registry.resolve("asset-hosted-1")).toEqual({
			assetId: "asset-hosted-1",
			src: "https://objects.example.test/refreshed?signature=new",
		});
		expect(JSON.stringify(firstUpload.asset)).toBe(assetBefore);
		expect(assetBefore).not.toContain("objects.example.test");
		expect(assetBefore).not.toContain("signature");
	});
});
