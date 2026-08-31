import { createHash } from "node:crypto";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import type {
	ObjectStoragePort,
	SignPutRequest,
	SignedPutUpload,
	StoredObjectHead,
} from "../../src/application/assets/object-storage.port";

type ObjectSigner = (
	client: S3Client,
	command: PutObjectCommand | GetObjectCommand,
	options: { readonly expiresIn: number },
) => Promise<string>;

export interface R2ObjectStorageOptions {
	readonly client: S3Client;
	readonly bucket: string;
	readonly signer?: ObjectSigner;
	readonly now?: () => Date;
}

export type R2Environment = Readonly<Record<string, string | undefined>>;

export interface R2Connection {
	readonly client: S3Client;
	readonly bucket: string;
}

const FILE_TYPE_SAMPLE_BYTES = 8 * 1024;

function assertChecksum(checksum: string): void {
	if (!/^[0-9a-f]{64}$/.test(checksum)) {
		throw new Error("Object checksum must be a lowercase SHA-256 hex digest");
	}
}

function isAsyncByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
	return (
		typeof value === "object" &&
		value !== null &&
		Symbol.asyncIterator in value &&
		typeof value[Symbol.asyncIterator] === "function"
	);
}

function closeStream(value: unknown): void {
	if (
		typeof value === "object" &&
		value !== null &&
		"destroy" in value &&
		typeof value.destroy === "function"
	) {
		value.destroy();
	}
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

function assertHttpsUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("Object storage returned an invalid signed upload URL");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("Object storage signed upload URL must use HTTPS");
	}
}

export function createR2ObjectStorage({
	client,
	bucket,
	signer = getSignedUrl,
	now = () => new Date(),
}: R2ObjectStorageOptions): ObjectStoragePort {
	if (!bucket.trim()) {
		throw new Error("R2 bucket is required");
	}

	return {
		async signPut(input: SignPutRequest): Promise<SignedPutUpload> {
			assertChecksum(input.checksumSha256);
			const command = new PutObjectCommand({
				Bucket: bucket,
				Key: input.objectKey,
				ContentType: input.contentType,
				ContentLength: input.byteSize,
			});
			const url = await signer(client, command, { expiresIn: input.expiresInSeconds });
			assertHttpsUrl(url);
			return {
				method: "PUT",
				url,
				headers: {
					"content-type": input.contentType,
				},
				checksum: { algorithm: "sha256", value: input.checksumSha256 },
				expiresAt: new Date(now().getTime() + input.expiresInSeconds * 1_000),
			};
		},

		async signGet(input) {
			const command = new GetObjectCommand({
				Bucket: bucket,
				Key: input.objectKey,
			});
			const url = await signer(client, command, { expiresIn: input.expiresInSeconds });
			assertHttpsUrl(url);
			return {
				method: "GET",
				url,
				expiresAt: new Date(now().getTime() + input.expiresInSeconds * 1_000),
			};
		},

		async verifyObject(objectKey: string, maxByteSize: number): Promise<StoredObjectHead | null> {
			if (!Number.isSafeInteger(maxByteSize) || maxByteSize <= 0) {
				throw new Error("Maximum object verification size must be a positive integer");
			}
			try {
				const result = await client.send(
					new GetObjectCommand({
						Bucket: bucket,
						Key: objectKey,
					}),
				);
				if (typeof result.ContentType !== "string") {
					throw new Error("Object storage returned incomplete object metadata");
				}
				if (
					typeof result.ContentLength === "number" &&
					result.ContentLength > maxByteSize
				) {
					closeStream(result.Body);
					return {
						contentType: result.ContentType,
						byteSize: result.ContentLength,
						checksumSha256: null,
						detectedMimeType: null,
					};
				}
				if (!isAsyncByteStream(result.Body)) {
					throw new Error("Object storage did not return a readable object body");
				}
				const hash = createHash("sha256");
				let byteSize = 0;
				let sampledBytes = 0;
				const samples: Buffer[] = [];
				for await (const chunk of result.Body) {
					byteSize += chunk.byteLength;
					if (byteSize > maxByteSize) {
						closeStream(result.Body);
						return {
							contentType: result.ContentType,
							byteSize,
							checksumSha256: null,
							detectedMimeType: null,
						};
					}
					hash.update(chunk);
					if (sampledBytes < FILE_TYPE_SAMPLE_BYTES) {
						const remaining = FILE_TYPE_SAMPLE_BYTES - sampledBytes;
						const sample = chunk.subarray(0, remaining);
						samples.push(Buffer.from(sample));
						sampledBytes += sample.byteLength;
					}
				}
				const detected = await fileTypeFromBuffer(Buffer.concat(samples));
				return {
					contentType: result.ContentType,
					byteSize,
					checksumSha256: hash.digest("hex"),
					detectedMimeType: detected?.mime ?? null,
				};
			} catch (error) {
				if (isMissingObject(error)) {
					return null;
				}
				throw error;
			}
		},

		async deleteObject(objectKey: string): Promise<void> {
			await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
		},
	};
}

export function r2ConnectionFromEnv(
	environment: R2Environment = process.env,
): R2Connection | null {
	const accountId = environment.R2_ACCOUNT_ID?.trim();
	const endpoint =
		environment.R2_ENDPOINT?.trim() ||
		(accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
	const accessKeyId = environment.R2_ACCESS_KEY_ID?.trim();
	const secretAccessKey = environment.R2_SECRET_ACCESS_KEY?.trim();
	const bucket = environment.R2_BUCKET?.trim();
	if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
		return null;
	}
	assertHttpsUrl(endpoint);
	return {
		client: new S3Client({
			region: "auto",
			endpoint,
			forcePathStyle: true,
			credentials: { accessKeyId, secretAccessKey },
		}),
		bucket,
	};
}

export function r2ObjectStorageFromEnv(
	environment: R2Environment = process.env,
): ObjectStoragePort | null {
	const connection = r2ConnectionFromEnv(environment);
	return connection ? createR2ObjectStorage(connection) : null;
}
