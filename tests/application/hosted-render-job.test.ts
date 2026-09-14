import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import type { ProjectDocumentRepositoryPort } from "@/application/project/project-document-repository.port";
import {
	type HostedRenderJob,
	type RenderJobRepositoryPort,
	createHostedRenderJobService,
	parseHostedRenderOptions,
} from "@/application/render/hosted-render-job";
import { describe, expect, it } from "vitest";

const DOCUMENT = migrateV1ToV2({
	title: "Code and media",
	code: "const launch = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [{ code: "const launch = true;", duration: 1000 }],
});
const NOW = new Date("2026-08-30T20:00:00.000Z");

function projectPort(): ProjectDocumentRepositoryPort {
	return {
		listByOwner: async () => [],
		findOwnedById: async (ownerId, id) =>
			ownerId === "owner-1" && id === DOCUMENT.project.id
				? {
						id,
						ownerId,
						revision: 4,
						document: DOCUMENT,
						createdAt: NOW,
						updatedAt: NOW,
					}
				: null,
		create: async () => {
			throw new Error("not used");
		},
		update: async () => ({ outcome: "not-found" }),
		deleteOwnedById: async () => false,
	};
}

class MemoryJobs implements RenderJobRepositoryPort {
	readonly jobs = new Map<string, HostedRenderJob>();
	lastInput: Parameters<RenderJobRepositoryPort["enqueueOrGet"]>[0] | null = null;

	async enqueueOrGet(input: Parameters<RenderJobRepositoryPort["enqueueOrGet"]>[0]) {
		this.lastInput = input;
		const existing = [...this.jobs.values()].find(
			(job) => job.projectId === input.projectId && job.revision === input.revision,
		);
		if (existing) {
			return existing;
		}
		const job: HostedRenderJob = {
			id: input.id,
			projectId: input.projectId,
			revision: input.revision,
			status: "queued",
			createdAt: NOW,
			completedAt: null,
		};
		this.jobs.set(job.id, job);
		return job;
	}

	async findOwnedById(_ownerId: string, id: string) {
		return this.jobs.get(id) ?? null;
	}
}

function service(input: { missing?: readonly string[] } = {}) {
	const jobs = new MemoryJobs();
	return {
		jobs,
		service: createHostedRenderJobService({
			projects: projectPort(),
			assets: { missingReadyAssetIds: async () => input.missing ?? [] },
			jobs,
			compilerVersion: "compiler-v2",
			createId: () => "job-1",
			hashOptions: (value) => `hash:${value}`,
		}),
	};
}

const OPTIONS = {
	format: "mp4" as const,
	width: 1920,
	height: 1080,
	fps: 60 as const,
	includeAudio: true,
};

describe("hosted render job service", () => {
	it("queues an immutable canonical revision rather than client project JSON", async () => {
		const { service: hosted, jobs } = service();

		const result = await hosted.submit({
			ownerId: "owner-1",
			projectId: DOCUMENT.project.id,
			revision: 4,
			renderOptions: OPTIONS,
		});

		expect(result).toMatchObject({ outcome: "accepted", job: { id: "job-1", status: "queued" } });
		expect(jobs.lastInput).toMatchObject({
			projectDocument: DOCUMENT,
			renderOptionsHash: "hash:mp4:1920:1080:60:1",
			compilerVersion: "compiler-v2",
		});
	});

	it("fails without revealing a foreign project and detects stale revisions", async () => {
		const hosted = service().service;
		await expect(
			hosted.submit({
				ownerId: "foreign",
				projectId: DOCUMENT.project.id,
				revision: 4,
				renderOptions: OPTIONS,
			}),
		).resolves.toEqual({ outcome: "project-not-found" });
		await expect(
			hosted.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 3,
				renderOptions: OPTIONS,
			}),
		).resolves.toEqual({ outcome: "revision-conflict", currentRevision: 4 });
	});

	it("refuses a revision until every referenced hosted asset is verified", async () => {
		const hosted = service({ missing: ["asset-local-only"] }).service;

		await expect(
			hosted.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 4,
				renderOptions: OPTIONS,
			}),
		).resolves.toEqual({ outcome: "assets-unavailable", assetIds: ["asset-local-only"] });
	});

	it("strictly parses bounded server render options", () => {
		expect(parseHostedRenderOptions(OPTIONS)).toEqual(OPTIONS);
		expect(() => parseHostedRenderOptions({ ...OPTIONS, width: 9999 })).toThrow("dimensions");
		expect(() => parseHostedRenderOptions({ ...OPTIONS, format: "gif" })).toThrow("format");
	});
});
