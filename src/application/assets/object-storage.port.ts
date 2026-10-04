import type { ObjectDeletePort } from "./object-delete.port";

export interface SignPutRequest {
	readonly objectKey: string;
	readonly contentType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
	readonly expiresInSeconds: number;
}

export interface SignedPutUpload {
	readonly method: "PUT";
	readonly url: string;
	/** Every header is part of the signature and must be sent unchanged. */
	readonly headers: Readonly<Record<string, string>>;
	readonly checksum: {
		readonly algorithm: "sha256";
		readonly value: string;
	};
	readonly expiresAt: Date;
}

export interface SignGetRequest {
	readonly objectKey: string;
	readonly expiresInSeconds: number;
}

/** Ephemeral access to a private object. The URL must never be persisted in a project. */
export interface SignedGetObject {
	readonly method: "GET";
	readonly url: string;
	readonly expiresAt: Date;
}

/** Metadata independently reported by object storage after the direct PUT. */
export interface StoredObjectHead {
	readonly contentType: string;
	readonly byteSize: number;
	readonly checksumSha256: string | null;
	/** MIME inferred from binary signatures, never from upload headers or filename. */
	readonly detectedMimeType: string | null;
}

export interface ObjectStoragePort extends ObjectDeletePort {
	signPut(input: SignPutRequest): Promise<SignedPutUpload>;
	signGet(input: SignGetRequest): Promise<SignedGetObject>;
	/**
	 * Read and hash the stored bytes independently. S3-compatible providers do
	 * not all expose a trustworthy full-object SHA-256 from HEAD (R2 notably
	 * does not), so finalization must not merely replay client metadata.
	 */
	verifyObject(objectKey: string, maxByteSize: number): Promise<StoredObjectHead | null>;
}
