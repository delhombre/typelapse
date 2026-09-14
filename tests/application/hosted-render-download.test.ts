import { describe, expect, it } from "vitest";
import type { ObjectStoragePort } from "../../src/application/assets/object-storage.port";
import {
	type HostedRenderOutputRepositoryPort,
	createHostedRenderDownloadService,
} from "../../src/application/render/hosted-render-download";

const NOW = new Date("2026-08-31T08:00:00.000Z");

function repository(
	result: Awaited<ReturnType<HostedRenderOutputRepositoryPort["findOwnedOutput"]>>,
): HostedRenderOutputRepositoryPort {
	return { findOwnedOutput: async () => result };
}

function storage(): ObjectStoragePort {
	return {
		signPut: async () => {
			throw new Error("not used");
		},
		signGet: async ({ objectKey, expiresInSeconds }) => ({
			method: "GET",
			url: `https://private.example.test/${encodeURIComponent(objectKey)}`,
			expiresAt: new Date(NOW.getTime() + expiresInSeconds * 1_000),
		}),
		verifyObject: async () => null,
		deleteObject: async () => undefined,
	};
}

describe("hosted render download", () => {
	it("signs only the private output of an owned succeeded job", async () => {
		const service = createHostedRenderDownloadService({
			outputs: repository({
				status: "succeeded",
				output: {
					objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
					mimeType: "video/mp4",
					byteSize: 42,
				},
			}),
			storage: storage(),
			expiresInSeconds: 60,
		});

		await expect(service.open("owner-1", "job-1")).resolves.toEqual({
			outcome: "ready",
			download: {
				method: "GET",
				url: expect.stringContaining("accounts%2Fowner-1"),
				expiresAt: new Date("2026-08-31T08:01:00.000Z"),
				mimeType: "video/mp4",
				byteSize: 42,
			},
		});
	});

	it("distinguishes an owned unfinished job from a missing or foreign id", async () => {
		const pending = createHostedRenderDownloadService({
			outputs: repository({ status: "running", output: null }),
			storage: storage(),
			expiresInSeconds: 60,
		});
		const missing = createHostedRenderDownloadService({
			outputs: repository(null),
			storage: storage(),
			expiresInSeconds: 60,
		});

		await expect(pending.open("owner-1", "job-1")).resolves.toEqual({ outcome: "not-ready" });
		await expect(missing.open("owner-1", "job-1")).resolves.toEqual({ outcome: "not-found" });
	});

	it("fails closed if persistence claims success without a complete private output", async () => {
		const service = createHostedRenderDownloadService({
			outputs: repository({ status: "succeeded", output: null }),
			storage: storage(),
			expiresInSeconds: 60,
		});

		await expect(service.open("owner-1", "job-1")).rejects.toThrow(
			"Succeeded hosted render is missing its private output",
		);
	});
});
