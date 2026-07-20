import type { RenderConfig } from "../entities/render-config";

/** Flat theme payload sent to the hosted renderer. */
export interface CloudThemePayload {
	name: string;
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	borderRadius: number;
}

export interface CloudRenderRequest {
	title: string;
	language: string;
	theme: CloudThemePayload;
	steps: { code: string; duration: number }[];
	background: string;
	framePadding: number;
	config: RenderConfig;
	watermark?: string;
}

export type CloudJobStatus = "queued" | "rendering" | "done" | "failed";

export interface CloudRenderJob {
	jobId: string;
	status: CloudJobStatus;
	/** Present once status === "done". */
	downloadUrl?: string;
	/** Human-readable status detail. */
	message?: string;
}

/**
 * Hosted render boundary. Implemented by an infrastructure adapter that talks
 * to the render service (currently a stub that acknowledges jobs without
 * rendering).
 */
export interface CloudExportPort {
	submitRender(request: CloudRenderRequest): Promise<CloudRenderJob>;
	getJob(jobId: string): Promise<CloudRenderJob>;
}
