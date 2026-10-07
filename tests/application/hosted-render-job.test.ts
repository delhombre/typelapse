import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import type { ProjectDocumentRepositoryPort } from "@/application/project/project-document-repository.port";
import {
	type HostedRenderJob,
	type RenderJobRepositoryPort,
	createHostedRenderJobService,
	parseHostedRenderOptions,
} from "@/application/render/hosted-render-job";
import { Plan } from "@/domain/value-objects/plan";
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

function projectPort(document = DOCUMENT): ProjectDocumentRepositoryPort {
	return {
		listByOwner: async () => [],
		existsOwnedById: async () => false,
		findOwnedById: async (ownerId, id) =>
			ownerId === "owner-1" && id === document.project.id
				? {
						id,
						ownerId,
						revision: 4,
						document,
						createdAt: NOW,
						updatedAt: NOW,
					}
				: null,
		create: async () => {
			throw new Error("not used");
		},
		update: async () => ({ outcome: "not-found" }),
		createAutomation: async () => {
			throw new Error("not used");
		},
		updateAutomation: async () => ({ outcome: "not-found" }),
		deleteOwnedById: async () => "not-found",
	};
}

class MemoryJobs implements RenderJobRepositoryPort {
	readonly jobs = new Map<string, HostedRenderJob>();
	lastInput: Parameters<RenderJobRepositoryPort["enqueueOrGet"]>[0] | null = null;
	activeRenders = 0;
	renderMsInPeriod = 0;

	async enqueueOrGet(input: Parameters<RenderJobRepositoryPort["enqueueOrGet"]>[0]) {
		this.lastInput = input;
		const existing = [...this.jobs.values()].find(
			(job) => job.projectId === input.projectId && job.revision === input.revision,
		);
		if (existing) {
			return { outcome: "enqueued" as const, job: existing };
		}
		if (this.activeRenders >= input.quota.maxActiveRenders) {
			return {
				outcome: "quota-exceeded" as const,
				ceiling: "concurrentRenders" as const,
				used: this.activeRenders,
			};
		}
		if (this.renderMsInPeriod + input.durationMs > input.quota.maxRenderMsInPeriod) {
			return {
				outcome: "quota-exceeded" as const,
				ceiling: "hostedRenderTime" as const,
				used: this.renderMsInPeriod,
			};
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
		return { outcome: "enqueued" as const, job };
	}

	async findOwnedById(_ownerId: string, id: string) {
		return this.jobs.get(id) ?? null;
	}
}

function service(input: { missing?: readonly string[]; document?: typeof DOCUMENT } = {}) {
	const jobs = new MemoryJobs();
	return {
		jobs,
		service: createHostedRenderJobService({
			projects: projectPort(input.document),
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
			plan: Plan.pro(),
			now: NOW,
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
				plan: Plan.pro(),
				now: NOW,
			}),
		).resolves.toEqual({ outcome: "project-not-found" });
		await expect(
			hosted.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 3,
				renderOptions: OPTIONS,
				plan: Plan.pro(),
				now: NOW,
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
				plan: Plan.pro(),
				now: NOW,
			}),
		).resolves.toEqual({ outcome: "assets-unavailable", assetIds: ["asset-local-only"] });
	});

	it("hands the store the output duration and the plan's ceilings for this month", async () => {
		const { service: hosted, jobs } = service();

		await hosted.submit({
			ownerId: "owner-1",
			projectId: DOCUMENT.project.id,
			revision: 4,
			renderOptions: OPTIONS,
			plan: Plan.pro(),
			now: NOW,
		});

		expect(jobs.lastInput).toMatchObject({
			durationMs: 1000,
			quota: {
				maxActiveRenders: 3,
				maxRenderMsInPeriod: 60 * 60_000,
				periodStart: new Date("2026-08-01T00:00:00.000Z"),
			},
		});
	});

	it("refuses past the monthly minutes and past three concurrent jobs", async () => {
		const minutes = service();
		minutes.jobs.renderMsInPeriod = 60 * 60_000 - 500;
		await expect(
			minutes.service.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 4,
				renderOptions: OPTIONS,
				plan: Plan.pro(),
				now: NOW,
			}),
		).resolves.toEqual({
			outcome: "plan-limit",
			ceiling: "hostedRenderTime",
			used: 60 * 60_000 - 500,
		});

		const busy = service();
		busy.jobs.activeRenders = 3;
		await expect(
			busy.service.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 4,
				renderOptions: OPTIONS,
				plan: Plan.pro(),
				now: NOW,
			}),
		).resolves.toEqual({ outcome: "plan-limit", ceiling: "concurrentRenders", used: 3 });
	});

	it("refuses a size larger than the plan's rectangle and names the rectangle", async () => {
		const { service: hosted, jobs } = service();

		const result = await hosted.submit({
			ownerId: "owner-1",
			projectId: DOCUMENT.project.id,
			revision: 4,
			renderOptions: { ...OPTIONS, width: 3840, height: 3840 },
			plan: Plan.pro(),
			now: NOW,
		});

		expect(result).toMatchObject({ outcome: "resolution-limit" });
		expect(result.outcome === "resolution-limit" && result.message).toContain("3840×2160");
		expect(result.outcome === "resolution-limit" && result.message).toContain("Creator");
		expect(jobs.lastInput).toBeNull();
		// The portrait twin of the 4K preset is the same entitlement.
		await expect(
			hosted.submit({
				ownerId: "owner-1",
				projectId: DOCUMENT.project.id,
				revision: 4,
				renderOptions: { ...OPTIONS, width: 2160, height: 3840 },
				plan: Plan.pro(),
				now: NOW,
			}),
		).resolves.toMatchObject({ outcome: "accepted" });
	});

	it("measures a looping render with its loop morph and hashes the loop apart", async () => {
		const twoScenes = migrateV1ToV2({
			title: "Loop",
			code: "const b = 2;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			transitionMs: 650,
			steps: [
				{ code: "const a = 1;", duration: 1000 },
				{ code: "const b = 2;", duration: 1000 },
			],
		});
		const { service: hosted, jobs } = service({ document: twoScenes });

		await hosted.submit({
			ownerId: "owner-1",
			projectId: twoScenes.project.id,
			revision: 4,
			renderOptions: { ...OPTIONS, loop: true },
			plan: Plan.pro(),
			now: NOW,
		});

		expect(jobs.lastInput).toMatchObject({
			durationMs: 1000 + 650 + 1000 + 650,
			renderOptionsHash: "hash:mp4:1920:1080:60:1:loop",
		});
	});

	it("strictly parses bounded server render options", () => {
		expect(parseHostedRenderOptions(OPTIONS)).toEqual(OPTIONS);
		expect(parseHostedRenderOptions({ ...OPTIONS, loop: true })).toEqual({
			...OPTIONS,
			loop: true,
		});
		expect(parseHostedRenderOptions({ ...OPTIONS, loop: false })).toEqual(OPTIONS);
		expect(() => parseHostedRenderOptions({ ...OPTIONS, loop: "yes" })).toThrow("loop");
		expect(() => parseHostedRenderOptions({ ...OPTIONS, width: 9999 })).toThrow("dimensions");
		expect(() => parseHostedRenderOptions({ ...OPTIONS, format: "gif" })).toThrow("format");
	});
});

describe("render options frame rate", () => {
	it("accepts the three rates the export panel offers and nothing else", () => {
		for (const fps of [24, 30, 60] as const) {
			expect(parseHostedRenderOptions({ ...OPTIONS, fps }).fps).toBe(fps);
		}
		expect(() => parseHostedRenderOptions({ ...OPTIONS, fps: 25 })).toThrow("fps");
	});
});
