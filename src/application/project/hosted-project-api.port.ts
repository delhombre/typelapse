import type { ProjectDocumentV2 } from "./project-document";

export interface HostedProjectSummary {
	readonly id: string;
	readonly title: string;
	readonly revision: number;
	readonly sceneCount: number;
	readonly updatedAt: Date;
}

export interface HostedProjectRecord {
	readonly id: string;
	readonly revision: number;
	readonly document: ProjectDocumentV2;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type HostedProjectUpdateResult =
	| { readonly outcome: "updated"; readonly project: HostedProjectRecord }
	| { readonly outcome: "conflict"; readonly currentRevision: number }
	| { readonly outcome: "not-found" };

export interface HostedProjectApiOptions {
	readonly signal?: AbortSignal;
}

export interface HostedProjectApiPort {
	list(options?: HostedProjectApiOptions): Promise<readonly HostedProjectSummary[]>;
	create(
		document: ProjectDocumentV2,
		options?: HostedProjectApiOptions,
	): Promise<HostedProjectRecord>;
	load(id: string, options?: HostedProjectApiOptions): Promise<HostedProjectRecord | null>;
	update(
		input: {
			readonly id: string;
			readonly expectedRevision: number;
			readonly document: ProjectDocumentV2;
		},
		options?: HostedProjectApiOptions,
	): Promise<HostedProjectUpdateResult>;
	delete(id: string, options?: HostedProjectApiOptions): Promise<boolean>;
}

export type HostedProjectApiErrorCode =
	| "unauthorized"
	| "rejected"
	| "unavailable"
	| "render-active"
	| "invalid-response";

export class HostedProjectApiError extends Error {
	readonly code: HostedProjectApiErrorCode;
	readonly status?: number;

	constructor(code: HostedProjectApiErrorCode, message: string, status?: number) {
		super(message);
		this.name = "HostedProjectApiError";
		this.code = code;
		this.status = status;
	}
}
