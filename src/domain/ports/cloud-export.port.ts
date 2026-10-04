/** What a hosted render job can be, as `GET /api/cloud/jobs/:id` reports it. */
export type CloudJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

/** The options `POST /api/cloud/render` accepts; the project itself is a saved revision. */
export interface CloudRenderOptions {
	readonly format: "mp4" | "webm";
	readonly width: number;
	readonly height: number;
	readonly fps: 24 | 30 | 60;
	readonly includeAudio: boolean;
	readonly loop?: boolean;
}

/** A short-lived signed link to the private output; it is asked for again at each download. */
export interface CloudDownload {
	readonly url: string;
	readonly expiresAt: string;
	readonly mimeType: string;
	readonly byteSize: number;
}

/** The render's public page (`/v/<id>`), present only where its owner may switch it. */
export interface CloudPublicPage {
	readonly public: boolean;
	readonly url: string;
}

export interface CloudRenderJob {
	readonly id: string;
	readonly status: CloudJobStatus;
	/** Present while the plan still keeps the output (the grace period after a downgrade). */
	readonly download: CloudDownload | null;
	readonly page?: CloudPublicPage | null;
}

/** The server said no, in its own sentence (a 402 names the plan that lifts it). */
export interface CloudRefusal {
	readonly kind: "refused";
	readonly status: number;
	readonly message: string;
	readonly code: string | null;
	readonly upgradeTo: string | null;
}

/** Nothing usable came back: the API is restarting, offline, or answered garbage. */
export interface CloudUnreachable {
	readonly kind: "unreachable";
}

export type CloudFailure = CloudRefusal | CloudUnreachable;

/** The server's own word on the account: its allowance sentence and whether renders are included. */
export interface CloudAllowance {
	readonly sentence: string;
	readonly hostedRenders: boolean;
}

/**
 * Hosted render boundary. Entitlement is never asserted by the client: the
 * session cookie is the only credential and every refusal is the server's.
 */
export interface CloudExportPort {
	allowance(): Promise<{ readonly kind: "ok"; readonly allowance: CloudAllowance } | CloudFailure>;
	submit(input: {
		readonly projectId?: string;
		readonly revision?: number;
		readonly renderOptions: CloudRenderOptions;
	}): Promise<{ readonly kind: "accepted"; readonly job: CloudRenderJob } | CloudFailure>;
	job(
		jobId: string,
	): Promise<
		| { readonly kind: "found"; readonly job: CloudRenderJob }
		| { readonly kind: "not-found" }
		| CloudFailure
	>;
	download(
		jobId: string,
	): Promise<{ readonly kind: "ready"; readonly download: CloudDownload } | CloudFailure>;
	setPublic(
		jobId: string,
		value: boolean,
	): Promise<{ readonly kind: "ok"; readonly page: CloudPublicPage } | CloudFailure>;
}
