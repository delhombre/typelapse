import type { ProjectDocumentV2 } from "../project/project-document";
import type { ProjectDocumentRepositoryPort } from "../project/project-document-repository.port";

export type HostedRenderStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type HostedRenderFormat = "mp4" | "webm";

export interface HostedRenderOptions {
	readonly format: HostedRenderFormat;
	readonly width: number;
	readonly height: number;
	readonly fps: 30 | 60;
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

export interface RenderJobRepositoryPort {
	enqueueOrGet(input: {
		readonly id: string;
		readonly ownerId: string;
		readonly projectId: string;
		readonly revision: number;
		readonly projectDocument: ProjectDocumentV2;
		readonly renderOptions: HostedRenderOptions;
		readonly renderOptionsHash: string;
		readonly compilerVersion: string;
	}): Promise<HostedRenderJob>;
	findOwnedById(ownerId: string, id: string): Promise<HostedRenderJob | null>;
}

export interface HostedRenderJobService {
	submit(input: {
		readonly ownerId: string;
		readonly projectId: string;
		readonly revision: number;
		readonly renderOptions: HostedRenderOptions;
	}): Promise<
		| { readonly outcome: "accepted"; readonly job: HostedRenderJob }
		| { readonly outcome: "project-not-found" }
		| { readonly outcome: "revision-conflict"; readonly currentRevision: number }
		| { readonly outcome: "assets-unavailable"; readonly assetIds: readonly string[] }
	>;
	status(ownerId: string, jobId: string): Promise<HostedRenderJob | null>;
}

const RENDER_FORMATS = new Set<HostedRenderFormat>(["mp4", "webm"]);
const RENDER_DIMENSIONS = new Set([720, 1080, 1280, 1440, 1920, 2160, 2560, 3840]);

export function parseHostedRenderOptions(input: unknown): HostedRenderOptions {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("Render options must be an object");
	}
	const value = input as Record<string, unknown>;
	if (!RENDER_FORMATS.has(value.format as HostedRenderFormat)) {
		throw new Error("Unsupported hosted render format");
	}
	if (
		typeof value.width !== "number" ||
		!RENDER_DIMENSIONS.has(value.width) ||
		typeof value.height !== "number" ||
		!RENDER_DIMENSIONS.has(value.height)
	) {
		throw new Error("Unsupported hosted render dimensions");
	}
	if (value.fps !== 30 && value.fps !== 60) {
		throw new Error("Hosted render fps must be 30 or 60");
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
			const job = await jobs.enqueueOrGet({
				id: createId(),
				ownerId: request.ownerId,
				projectId: request.projectId,
				revision: request.revision,
				projectDocument: project.document,
				renderOptions: request.renderOptions,
				renderOptionsHash: hashOptions(renderOptionsIdentity(request.renderOptions)),
				compilerVersion,
			});
			return { outcome: "accepted", job };
		},

		status(ownerId, jobId) {
			return jobs.findOwnedById(ownerId, jobId);
		},
	};
}
