import { createReadStream } from "node:fs";
import { lstat, open, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { AssetRepositoryPort } from "../../src/application/assets/asset-repository.port";
import {
	HostedRenderProcessingError,
	type HostedRenderOutputStoragePort,
} from "../../src/application/render/process-hosted-render-job";
import type { HostedRenderAssetMaterializerPort } from "../render/v2/remotion-v2-renderer";
import {
	r2ConnectionFromEnv,
	type R2Connection,
	type R2Environment,
} from "./r2-object-storage";

type PrivateObjectBody = AsyncIterable<Uint8Array>;

export interface HostedRenderObjectClientPort {
	getObject(objectKey: string, signal: AbortSignal): Promise<PrivateObjectBody | null>;
	putObject(input: {
		readonly objectKey: string;
		readonly contentType: string;
		readonly contentLength: number;
		readonly body: PrivateObjectBody;
		readonly signal: AbortSignal;
	}): Promise<void>;
	deleteObject(objectKey: string): Promise<void>;
}

export type HostedRenderObjectStorage = HostedRenderAssetMaterializerPort &
	HostedRenderOutputStoragePort;

function isAsyncBody(value: unknown): value is PrivateObjectBody {
	return (
		typeof value === "object" &&
		value !== null &&
		Symbol.asyncIterator in value &&
		typeof value[Symbol.asyncIterator] === "function"
	);
}

function isMissingObject(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	if (error.name === "NotFound" || error.name === "NoSuchKey") {
		return true;
	}
	const metadata = (error as Error & { readonly $metadata?: { readonly httpStatusCode?: number } })
		.$metadata;
	return metadata?.httpStatusCode === 404;
}

export function createR2HostedRenderObjectClient({
	client,
	bucket,
}: R2Connection): HostedRenderObjectClientPort {
	return {
		async getObject(objectKey, signal) {
			try {
				const result = await client.send(
					new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
					{ abortSignal: signal },
				);
				if (!isAsyncBody(result.Body)) {
					throw new Error("Private object storage returned an unreadable body");
				}
				return result.Body;
			} catch (error) {
				if (isMissingObject(error)) {
					return null;
				}
				throw error;
			}
		},

		async putObject(input) {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: input.objectKey,
					Body: Readable.from(input.body),
					ContentType: input.contentType,
					ContentLength: input.contentLength,
				}),
				{ abortSignal: input.signal },
			);
		},

		async deleteObject(objectKey) {
			await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
		},
	};
}

function unavailableAsset(): HostedRenderProcessingError {
	return new HostedRenderProcessingError(
		"render-asset-unavailable",
		"A private render asset is unavailable",
		{ retryable: false },
	);
}

function invalidAsset(): HostedRenderProcessingError {
	return new HostedRenderProcessingError(
		"render-asset-invalid",
		"A private render asset failed integrity validation",
		{ retryable: false },
	);
}

export function createHostedRenderObjectStorage(input: {
	readonly assets: AssetRepositoryPort;
	readonly client: HostedRenderObjectClientPort;
}): HostedRenderObjectStorage {
	return {
		async materializePrivateAsset(request) {
			request.signal.throwIfAborted();
			const asset = await input.assets.findOwnedById(request.ownerId, request.assetId);
			if (
				!asset ||
				asset.projectId !== request.projectId ||
				asset.status !== "ready" ||
				asset.verifiedChecksum !== asset.metadata.checksum
			) {
				throw unavailableAsset();
			}
			const body = await input.client.getObject(asset.objectKey, request.signal);
			if (!body) {
				throw unavailableAsset();
			}

			let file: Awaited<ReturnType<typeof open>> | null = null;
			let created = false;
			try {
				file = await open(request.destinationPath, "wx", 0o600);
				created = true;
				let written = 0;
				for await (const chunk of body) {
					request.signal.throwIfAborted();
					if (!(chunk instanceof Uint8Array)) {
						throw invalidAsset();
					}
					written += chunk.byteLength;
					if (written > asset.metadata.byteSize) {
						throw invalidAsset();
					}
					await file.write(chunk);
				}
				request.signal.throwIfAborted();
				if (written !== asset.metadata.byteSize) {
					throw invalidAsset();
				}
			} catch (error) {
				await file?.close().catch(() => undefined);
				file = null;
				if (created) {
					await rm(request.destinationPath, { force: true });
				}
				throw error;
			} finally {
				await file?.close();
			}
		},

		async storePrivate(request) {
			request.signal.throwIfAborted();
			const stats = await lstat(request.artifact.temporaryId);
			if (
				!stats.isFile() ||
				stats.isSymbolicLink() ||
				stats.size !== request.artifact.byteSize
			) {
				throw new Error("Hosted render artifact is not a validated regular file");
			}
			const body = createReadStream(request.artifact.temporaryId, {
				signal: request.signal,
			}) as PrivateObjectBody;
			await input.client.putObject({
				objectKey: request.objectKey,
				contentType: request.artifact.mimeType,
				contentLength: request.artifact.byteSize,
				body,
				signal: request.signal,
			});
		},

		deletePrivate(objectKey) {
			return input.client.deleteObject(objectKey);
		},
	};
}

export function hostedRenderObjectStorageFromEnv(input: {
	readonly assets: AssetRepositoryPort;
	readonly environment?: R2Environment;
	readonly connectionFactory?: (environment: R2Environment) => R2Connection | null;
	readonly clientFactory?: (connection: R2Connection) => HostedRenderObjectClientPort;
}): HostedRenderObjectStorage | null {
	const environment = input.environment ?? process.env;
	const connection = (input.connectionFactory ?? r2ConnectionFromEnv)(environment);
	if (!connection) {
		return null;
	}
	const client = (input.clientFactory ?? createR2HostedRenderObjectClient)(connection);
	return createHostedRenderObjectStorage({ assets: input.assets, client });
}
