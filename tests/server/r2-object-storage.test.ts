// @vitest-environment node

import { createHash } from "node:crypto";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import {
	createR2ObjectStorage,
	r2ObjectStorageFromEnv,
} from "../../server/storage/r2-object-storage";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const OBJECT_BYTES = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52,
]);
const CHECKSUM = createHash("sha256").update(OBJECT_BYTES).digest("hex");

async function* objectBody(): AsyncIterable<Uint8Array> {
	yield OBJECT_BYTES.subarray(0, 8);
	yield OBJECT_BYTES.subarray(8);
}

class FakeS3 {
	readonly commands: unknown[] = [];
	objectResult: unknown = {
		ContentType: "image/png",
		ContentLength: OBJECT_BYTES.byteLength,
		Body: objectBody(),
	};

	async send(command: unknown): Promise<unknown> {
		this.commands.push(command);
		if (command instanceof GetObjectCommand) {
			return this.objectResult;
		}
		return {};
	}
}

describe("R2 object storage", () => {
	it("signs a private metadata-bound PUT without exposing storage credentials", async () => {
		const client = new FakeS3();
		let signedCommand: unknown;
		const storage = createR2ObjectStorage({
			client: client as unknown as S3Client,
			bucket: "typelapse-private",
			now: () => NOW,
			signer: async (_client, command) => {
				signedCommand = command;
				return "https://r2.example.test/signed-put?X-Amz-Signature=redacted";
			},
		});

		const upload = await storage.signPut({
			objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
			contentType: "image/png",
			byteSize: 42,
			checksumSha256: CHECKSUM,
			expiresInSeconds: 600,
		});

		expect(signedCommand).toBeInstanceOf(PutObjectCommand);
		expect((signedCommand as PutObjectCommand).input).toMatchObject({
			Bucket: "typelapse-private",
			Key: "accounts/user-1/projects/project-1/assets/asset-1",
			ContentType: "image/png",
			ContentLength: 42,
		});
		expect(upload).toEqual({
			method: "PUT",
			url: "https://r2.example.test/signed-put?X-Amz-Signature=redacted",
			headers: {
				"content-type": "image/png",
			},
			checksum: { algorithm: "sha256", value: CHECKSUM },
			expiresAt: new Date(NOW.getTime() + 600_000),
		});
	});

	it("signs a short-lived private GET without proxying media bytes through the API", async () => {
		const client = new FakeS3();
		let signedCommand: unknown;
		const storage = createR2ObjectStorage({
			client: client as unknown as S3Client,
			bucket: "typelapse-private",
			now: () => NOW,
			signer: async (_client, command) => {
				signedCommand = command;
				return "https://r2.example.test/signed-get?X-Amz-Signature=redacted";
			},
		});

		const access = await storage.signGet({
			objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
			expiresInSeconds: 300,
		});

		expect(signedCommand).toBeInstanceOf(GetObjectCommand);
		expect((signedCommand as GetObjectCommand).input).toMatchObject({
			Bucket: "typelapse-private",
			Key: "accounts/user-1/projects/project-1/assets/asset-1",
		});
		expect(access).toEqual({
			method: "GET",
			url: "https://r2.example.test/signed-get?X-Amz-Signature=redacted",
			expiresAt: new Date(NOW.getTime() + 300_000),
		});
	});

	it("streams and hashes the stored bytes independently, then deletes by private key", async () => {
		const client = new FakeS3();
		const storage = createR2ObjectStorage({
			client: client as unknown as S3Client,
			bucket: "typelapse-private",
			now: () => NOW,
			signer: async () => "https://r2.example.test/upload",
		});

		await expect(storage.verifyObject("private-key", OBJECT_BYTES.byteLength)).resolves.toEqual({
			contentType: "image/png",
			byteSize: OBJECT_BYTES.byteLength,
			checksumSha256: CHECKSUM,
			detectedMimeType: "image/png",
		});
		await storage.deleteObject("private-key");

		expect(client.commands[0]).toBeInstanceOf(GetObjectCommand);
		expect((client.commands[0] as GetObjectCommand).input).toMatchObject({
			Bucket: "typelapse-private",
			Key: "private-key",
		});
		expect(client.commands[1]).toBeInstanceOf(DeleteObjectCommand);
	});

	it("treats a storage NotFound as an absent upload", async () => {
		const client = new FakeS3();
		client.objectResult = null;
		client.send = async () => {
			throw Object.assign(new Error("missing"), { name: "NotFound" });
		};
		const storage = createR2ObjectStorage({
			client: client as unknown as S3Client,
			bucket: "private",
			now: () => NOW,
			signer: async () => "https://r2.example.test/upload",
		});

		await expect(storage.verifyObject("missing", 10)).resolves.toBeNull();
	});

	it("stays unavailable until every private R2 credential is configured", () => {
		expect(r2ObjectStorageFromEnv({})).toBeNull();
		expect(
			r2ObjectStorageFromEnv({
				R2_ACCOUNT_ID: "account",
				R2_ACCESS_KEY_ID: "key",
				R2_SECRET_ACCESS_KEY: "secret",
			}),
		).toBeNull();
	});
});
