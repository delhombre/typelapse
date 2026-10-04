import {
	type HostedProjectAssetResolverPort,
	canonicalizeHostedProjectUpdate,
} from "@/application/assets/canonicalize-hosted-project-assets";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

function clientDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "untrusted-client-project-id",
			title: "Canonical media",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "asset-z",
					kind: "audio",
					fileName: "client-lie.mp3",
					mimeType: "audio/mpeg",
					byteSize: 1,
					checksum: "client-lie",
					durationMs: 1,
				},
				{
					id: "asset-a",
					kind: "image",
					fileName: "also-client-controlled.png",
					mimeType: "image/png",
					byteSize: 2,
					checksum: "also-client-controlled",
					width: 1,
					height: 1,
				},
			],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1000,
					blocks: [
						{
							id: "image-a",
							kind: "image",
							assetId: "asset-a",
							placement: { x: 0, y: 0, width: 0.5, height: 1 },
							opacity: 1,
							fit: "cover",
							focalPoint: { x: 0.5, y: 0.5 },
						},
						{
							id: "image-z",
							kind: "image",
							assetId: "asset-z",
							placement: { x: 0.5, y: 0, width: 0.5, height: 1 },
							opacity: 1,
							fit: "contain",
							focalPoint: { x: 0.5, y: 0.5 },
						},
					],
				},
			],
			audioCues: [],
		},
	};
}

describe("hosted project asset canonicalization", () => {
	it("rebuilds stable asset metadata from the owner/project-scoped ready resolver", async () => {
		const assets: HostedProjectAssetResolverPort = {
			resolveReadyForProject: async (input) => {
				if (
					input.ownerId !== "account-1" ||
					input.projectId !== "project-server-1" ||
					input.assetIds.join(",") !== "asset-a,asset-z"
				) {
					return [];
				}
				return [
					{
						id: "asset-z",
						metadata: {
							kind: "image",
							fileName: "verified-z.png",
							mimeType: "image/png",
							byteSize: 900,
							checksum: "server-z",
							width: 900,
							height: 600,
						},
					},
					{
						id: "asset-a",
						metadata: {
							kind: "image",
							fileName: "verified-a.png",
							mimeType: "image/png",
							byteSize: 800,
							checksum: "server-a",
							width: 800,
							height: 500,
						},
					},
				];
			},
		};

		const canonical = await canonicalizeHostedProjectUpdate({
			ownerId: "account-1",
			projectId: "project-server-1",
			document: clientDocument(),
			assets,
		});

		expect(canonical.project.id).toBe("project-server-1");
		expect(canonical.project.assets).toEqual([
			{
				id: "asset-a",
				kind: "image",
				fileName: "verified-a.png",
				mimeType: "image/png",
				byteSize: 800,
				checksum: "server-a",
				width: 800,
				height: 500,
			},
			{
				id: "asset-z",
				kind: "image",
				fileName: "verified-z.png",
				mimeType: "image/png",
				byteSize: 900,
				checksum: "server-z",
				width: 900,
				height: 600,
			},
		]);
	});

	it("runs full Project aggregate validation after rebuilding the document", async () => {
		const document = clientDocument();
		document.project.assets = [];
		document.project.scenes = [
			{
				id: "scene-long",
				durationMs: Number.MAX_SAFE_INTEGER,
				blocks: [
					{
						id: "text-long",
						kind: "text",
						text: "Long",
						placement: { x: 0, y: 0, width: 1, height: 1 },
						opacity: 1,
						typography: {
							fontFamily: "Inter",
							fontSize: 48,
							fontWeight: 700,
							color: "#fff",
							align: "center",
						},
					},
				],
			},
			{
				id: "scene-overflow",
				durationMs: 1,
				blocks: [
					{
						id: "text-overflow",
						kind: "text",
						text: "Overflow",
						placement: { x: 0, y: 0, width: 1, height: 1 },
						opacity: 1,
						typography: {
							fontFamily: "Inter",
							fontSize: 48,
							fontWeight: 700,
							color: "#fff",
							align: "center",
						},
					},
				],
			},
		];

		await expect(
			canonicalizeHostedProjectUpdate({
				ownerId: "account-1",
				projectId: "project-server-1",
				document,
				assets: { resolveReadyForProject: async () => [] },
			}),
		).rejects.toThrow("Project visual duration must be a safe integer");
	});

	it("keeps an audio-only update valid without client-supplied asset metadata", async () => {
		const document = clientDocument();
		document.project.assets = [];
		document.project.scenes = [];
		document.project.audioCues = [
			{
				id: "cue-1",
				assetId: "asset-audio",
				startMs: 0,
				trim: { startMs: 0, endMs: 1000 },
				gain: 1,
				fadeInMs: 0,
				fadeOutMs: 0,
			},
		];

		const canonical = await canonicalizeHostedProjectUpdate({
			ownerId: "account-1",
			projectId: "project-server-1",
			document,
			assets: {
				resolveReadyForProject: async () => [
					{
						id: "asset-audio",
						metadata: {
							kind: "audio",
							fileName: "verified.wav",
							mimeType: "audio/wav",
							byteSize: 4_000,
							checksum: "server-audio",
							durationMs: 2_000,
						},
					},
				],
			},
		});

		expect(canonical.project.assets).toEqual([
			{
				id: "asset-audio",
				kind: "audio",
				fileName: "verified.wav",
				mimeType: "audio/wav",
				byteSize: 4_000,
				checksum: "server-audio",
				durationMs: 2_000,
			},
		]);
	});
});
