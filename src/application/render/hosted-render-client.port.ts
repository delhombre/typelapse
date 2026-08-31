import type { HostedRenderOptions, HostedRenderStatus } from "./hosted-render-job";

export interface HostedRenderClientRequest {
	readonly projectId: string;
	readonly revision: number;
	readonly renderOptions: HostedRenderOptions;
}

/** JSON-safe job view returned by the hosted HTTP boundary. */
export interface HostedRenderJobSnapshot {
	readonly id: string;
	readonly projectId: string;
	readonly revision: number;
	readonly status: HostedRenderStatus;
	readonly createdAt: string;
	readonly completedAt: string | null;
	readonly errorCode?: string;
}

export interface HostedRenderClientDownload {
	readonly method: "GET";
	readonly url: string;
	readonly expiresAt: string;
	readonly mimeType: string;
	readonly byteSize: number;
}

export interface HostedRenderStatusSnapshot {
	readonly job: HostedRenderJobSnapshot;
	readonly download?: HostedRenderClientDownload;
}

export interface HostedRenderClientCallOptions {
	readonly signal?: AbortSignal;
}

/**
 * Browser-side hosted render boundary. It only accepts a canonical project id
 * and revision; it never uploads an ad-hoc client render program.
 */
export interface HostedRenderClientPort {
	submit(
		request: HostedRenderClientRequest,
		options?: HostedRenderClientCallOptions,
	): Promise<HostedRenderJobSnapshot>;
	status(
		jobId: string,
		options?: HostedRenderClientCallOptions,
	): Promise<HostedRenderStatusSnapshot>;
	download(
		jobId: string,
		options?: HostedRenderClientCallOptions,
	): Promise<HostedRenderClientDownload>;
}
