import { isRenderDimension } from "../../domain/entities/render-config";
import type { Plan } from "../../domain/value-objects/plan";
import { renderPeriodStart } from "../billing/plan-allowance";
import { hydrateProjectDocument } from "../project/hydrate-project-document";
import type { ProjectDocumentV2 } from "../project/project-document";
import type { ProjectDocumentRepositoryPort } from "../project/project-document-repository.port";

export type HostedRenderStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type HostedRenderFormat = "mp4" | "webm";

export interface HostedRenderOptions {
	readonly format: HostedRenderFormat;
	readonly width: number;
	readonly height: number;
	readonly fps: 24 | 30 | 60;
	readonly includeAudio: boolean;
}

export interface HostedRenderJob {
	readonly id: string;
	readonly projectId: string;
	readonly revision: number;
	readonly status: HostedRenderStatus;
	readonly createdAt: Date;
	readonly completedAt: Date | null;
	readonly downloadUrl?: string;
	readonly errorCode?: string;
}

export interface RenderAssetReadinessPort {
	missingReadyAssetIds(input: {
		readonly ownerId: string;
		readonly projectId: string;
		readonly assetIds: readonly string[];
	}): Promise<readonly string[]>;
}

/** The plan's render ceilings, checked by the store under the same lock as the insert. */
export interface RenderJobQuota {
	readonly maxActiveRenders: number;
	readonly maxRenderMsInPeriod: number;
	readonly periodStart: Date;
}

export type EnqueueRenderJobResult =
	| { readonly outcome: "enqueued"; readonly job: HostedRenderJob }
	| {
			readonly outcome: "quota-exceeded";
			readonly ceiling: "concurrentRenders" | "hostedRenderTime";
			readonly used: number;
	  };

export interface RenderJobRepositoryPort {
	/**
	 * Idempotent: a resubmission of the same revision and options returns the
	 * existing job without counting against the quota a second time.
	 */
	enqueueOrGet(input: {
		readonly id: string;
		readonly ownerId: string;
		readonly projectId: string;
		readonly revision: number;
		readonly projectDocument: ProjectDocumentV2;
		readonly renderOptions: HostedRenderOptions;
		readonly renderOptionsHash: string;
		readonly compilerVersion: string;
		/** Output length, which is what the monthly minutes measure. */
		readonly durationMs: number;
		readonly quota: RenderJobQuota;
	}): Promise<EnqueueRenderJobResult>;
	findOwnedById(ownerId: string, id: string): Promise<HostedRenderJob | null>;
}

export interface HostedRenderJobService {
	submit(input: {
		readonly ownerId: string;
		readonly projectId: string;
		readonly revision: number;
		readonly renderOptions: HostedRenderOptions;
		/** Resolved server-side from the account, never from the request. */
		readonly plan: Plan;
		readonly now: Date;
	}): Promise<
		| { readonly outcome: "accepted"; readonly job: HostedRenderJob }
		| {
				readonly outcome: "plan-limit";
				readonly ceiling: "concurrentRenders" | "hostedRenderTime";
				readonly used: number;
		  }
		| { readonly outcome: "project-not-found" }
		| { readonly outcome: "revision-conflict"; readonly currentRevision: number }
		| { readonly outcome: "assets-unavailable"; readonly assetIds: readonly string[] }
	>;
	status(ownerId: string, jobId: string): Promise<HostedRenderJob | null>;
}

const RENDER_FORMATS = new Set<HostedRenderFormat>(["mp4", "webm"]);

export function parseHostedRenderOptions(input: unknown): HostedRenderOptions {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("Render options must be an object");
	}
	const value = input as Record<string, unknown>;
	if (!RENDER_FORMATS.has(value.format as HostedRenderFormat)) {
		throw new Error("Unsupported hosted render format");
	}
	if (!isRenderDimension(value.width) || !isRenderDimension(value.height)) {
		throw new Error("Unsupported hosted render dimensions");
	}
	if (value.fps !== 24 && value.fps !== 30 && value.fps !== 60) {
		throw new Error("Hosted render fps must be 24, 30 or 60");
	}
	if (typeof value.includeAudio !== "boolean") {
		throw new Error("Hosted render includeAudio must be boolean");
	}
	return {
		format: value.format as HostedRenderFormat,
		width: value.width,
		height: value.height,
		fps: value.fps,
		includeAudio: value.includeAudio,
	};
}

function renderOptionsIdentity(value: HostedRenderOptions): string {
	return [value.format, value.width, value.height, value.fps, value.includeAudio ? 1 : 0].join(":");
}

/** Canonical project revision to durable render job; client programs are never accepted. */
export function createHostedRenderJobService(input: {
	readonly projects: ProjectDocumentRepositoryPort;
	readonly assets: RenderAssetReadinessPort;
	readonly jobs: RenderJobRepositoryPort;
	readonly compilerVersion: string;
	readonly createId?: () => string;
	readonly hashOptions: (canonicalOptions: string) => string;
}): HostedRenderJobService {
	const {
		projects,
		assets,
		jobs,
		compilerVersion,
		createId = () => `job_${crypto.randomUUID()}`,
		hashOptions,
	} = input;
	return {
		async submit(request) {
			const project = await projects.findOwnedById(request.ownerId, request.projectId);
			if (!project) {
				return { outcome: "project-not-found" };
			}
			if (project.revision !== request.revision) {
				return { outcome: "revision-conflict", currentRevision: project.revision };
			}
			const assetIds = project.document.project.assets.map((asset) => asset.id);
			const missing = await assets.missingReadyAssetIds({
				ownerId: request.ownerId,
				projectId: request.projectId,
				assetIds,
			});
			if (missing.length > 0) {
				return { outcome: "assets-unavailable", assetIds: missing };
			}
			const result = await jobs.enqueueOrGet({
				id: createId(),
				ownerId: request.ownerId,
				projectId: request.projectId,
				revision: request.revision,
				projectDocument: project.document,
				renderOptions: request.renderOptions,
				renderOptionsHash: hashOptions(renderOptionsIdentity(request.renderOptions)),
				compilerVersion,
				durationMs: hydrateProjectDocument(project.document).project.durationMs,
				quota: {
					maxActiveRenders: request.plan.limitFor("concurrentRenders"),
					maxRenderMsInPeriod: request.plan.limitFor("hostedRenderTime"),
					periodStart: renderPeriodStart(request.now),
				},
			});
			if (result.outcome === "quota-exceeded") {
				return { outcome: "plan-limit", ceiling: result.ceiling, used: result.used };
			}
			return { outcome: "accepted", job: result.job };
		},

		status(ownerId, jobId) {
			return jobs.findOwnedById(ownerId, jobId);
		},
	};
}
