import type { ObjectStoragePort, SignedGetObject } from "../assets/object-storage.port";
import type { HostedRenderStatus } from "./hosted-render-job";

export interface HostedRenderOutputRecord {
	readonly status: HostedRenderStatus;
	readonly output: {
		readonly objectKey: string;
		readonly mimeType: string;
		readonly byteSize: number;
	} | null;
}

export interface HostedRenderOutputRepositoryPort {
	findOwnedOutput(ownerId: string, jobId: string): Promise<HostedRenderOutputRecord | null>;
}

export interface HostedRenderDownload
	extends Pick<SignedGetObject, "method" | "url" | "expiresAt"> {
	readonly mimeType: string;
	readonly byteSize: number;
}

export interface HostedRenderDownloadService {
	open(
		ownerId: string,
		jobId: string,
	): Promise<
		| { readonly outcome: "ready"; readonly download: HostedRenderDownload }
		| { readonly outcome: "not-ready" }
		| { readonly outcome: "not-found" }
	>;
}

/** Owner-scoped output access; durable object keys never cross the HTTP boundary. */
export function createHostedRenderDownloadService(input: {
	readonly outputs: HostedRenderOutputRepositoryPort;
	readonly storage: ObjectStoragePort;
	readonly expiresInSeconds: number;
}): HostedRenderDownloadService {
	if (!Number.isSafeInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0) {
		throw new Error("Hosted render download expiry must be a positive integer");
	}
	return {
		async open(ownerId, jobId) {
			const record = await input.outputs.findOwnedOutput(ownerId, jobId);
			if (!record) {
				return { outcome: "not-found" };
			}
			if (record.status !== "succeeded") {
				return { outcome: "not-ready" };
			}
			if (!record.output) {
				throw new Error("Succeeded hosted render is missing its private output");
			}
			const access = await input.storage.signGet({
				objectKey: record.output.objectKey,
				expiresInSeconds: input.expiresInSeconds,
			});
			return {
				outcome: "ready",
				download: {
					...access,
					mimeType: record.output.mimeType,
					byteSize: record.output.byteSize,
				},
			};
		},
	};
}
