import { isRenderDimension } from "../../domain/entities/render-config";
import type { Plan } from "../../domain/value-objects/plan";
import { renderPeriodStart } from "../billing/plan-allowance";
import type { ProjectDocumentV2 } from "../project/project-document";
import type { ProjectDocumentRepositoryPort } from "../project/project-document-repository.port";
import { compileSceneTimeline } from "./scene-timeline";

export type HostedRenderStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type HostedRenderFormat = "mp4" | "webm";

export interface HostedRenderOptions {
	readonly format: HostedRenderFormat;
	readonly width: number;
	readonly height: number;
	readonly fps: 24 | 30 | 60;
	readonly includeAudio: boolean;
	/** Loop on: the file ends on the morph back to the first scene. Absent means off. */
	readonly loop?: boolean;
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
		| { readonly outcome: "resolution-limit"; readonly message: string }
	>;
	status(ownerId: string, jobId: string): Promise<HostedRenderJob | null>;
}

const RENDER_FORMATS = new Set<HostedRenderFormat>(["mp4", "webm"]);

/** What a size past the plan's rectangle is told, by the job queue and by anyone who asks first. */
export function resolutionLimitMessage(plan: Plan, width: number, height: number): string {
	const { hostedMaxLongEdge, hostedMaxShortEdge } = plan.capabilities;
	return `${plan.label} renders up to ${hostedMaxLongEdge}×${hostedMaxShortEdge} in either orientation, and ${width}×${height} is larger`;
}

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
	if (value.loop !== undefined && typeof value.loop !== "boolean") {
		throw new Error("Hosted render loop must be boolean");
	}
	return {
		format: value.format as HostedRenderFormat,
		width: value.width,
		height: value.height,
		fps: value.fps,
		includeAudio: value.includeAudio,
		// Written only when on, so a stored job from before the loop reads the same.
		...(value.loop === true ? { loop: true } : {}),
	};
}

function renderOptionsIdentity(value: HostedRenderOptions): string {
	const identity = [value.format, value.width, value.height, value.fps, value.includeAudio ? 1 : 0];
	// Appended only when on, so the jobs enqueued before the loop keep their hash.
	return (value.loop ? [...identity, "loop"] : identity).join(":");
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
			// The size rule admits any even size up to 3840 on each axis; the plan sells a
			// rectangle, so 3840x3840 is twice the pixels Creator's 4K pays for.
			const { width, height } = request.renderOptions;
			if (!request.plan.allowsHostedResolution(width, height)) {
				return {
					outcome: "resolution-limit",
					message: resolutionLimitMessage(request.plan, width, height),
				};
			}
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
				durationMs: compileSceneTimeline({
					document: project.document,
					fps: request.renderOptions.fps,
					loop: request.renderOptions.loop === true,
				}).durationMs,
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
