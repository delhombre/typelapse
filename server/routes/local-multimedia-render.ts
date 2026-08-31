import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	type ProjectDocumentV2,
	parseProjectDocument,
} from "../../src/application/project/project-document";
import {
	type HostedRenderOptions,
	parseHostedRenderOptions,
} from "../../src/application/render/hosted-render-job";
import type {
	HostedMultimediaRendererPort,
	HostedRenderTemporaryArtifact,
} from "../../src/application/render/process-hosted-render-job";
import { createHostedRemotionV2Renderer } from "../render/v2/remotion-v2-renderer";

const MAX_MULTIPART_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_BYTES = 128 * 1024 * 1024;

export interface LocalRenderAssetBytesPort {
	bytesFor(assetId: string): Promise<Uint8Array>;
}

export interface LocalMultimediaRendererFactory {
	(assets: LocalRenderAssetBytesPort): HostedMultimediaRendererPort;
}

export interface LocalMultimediaRenderRouteOptions {
	readonly createRenderer?: LocalMultimediaRendererFactory;
	readonly compilerVersion?: string;
}

interface ValidatedRequest {
	readonly document: ProjectDocumentV2;
	readonly options: HostedRenderOptions;
	readonly assets: ReadonlyMap<string, Uint8Array>;
}

class LocalRenderRequestError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 413 | 415 | 422,
		readonly details?: Readonly<Record<string, string>>,
	) {
		super(message);
	}
}

function defaultRendererFactory(assets: LocalRenderAssetBytesPort): HostedMultimediaRendererPort {
	return createHostedRemotionV2Renderer({
		assets: {
			async materializePrivateAsset(input) {
				await writeFile(input.destinationPath, await assets.bytesFor(input.assetId));
			},
		},
	});
}

function requiredStringPart(form: FormData, name: string): string {
	const value = form.get(name);
	if (typeof value !== "string" || !value.trim()) {
		throw new LocalRenderRequestError(`Missing '${name}' form field`, 400);
	}
	return value;
}

function parseJson(value: string, label: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new LocalRenderRequestError(`Invalid ${label} JSON`, 400);
	}
}

function parseDocument(value: string): ProjectDocumentV2 {
	let parsed: ReturnType<typeof parseProjectDocument>;
	try {
		parsed = parseProjectDocument(parseJson(value, "project"));
	} catch (error) {
		if (error instanceof LocalRenderRequestError) {
			throw error;
		}
		throw new LocalRenderRequestError("Invalid multimedia project document", 400);
	}
	if (parsed.schemaVersion !== 2) {
		throw new LocalRenderRequestError("Local multimedia rendering requires a V2 project", 400);
	}
	return parsed.document;
}

function parseOptions(value: string): HostedRenderOptions {
	try {
		return parseHostedRenderOptions(parseJson(value, "render options"));
	} catch (error) {
		if (error instanceof LocalRenderRequestError) {
			throw error;
		}
		throw new LocalRenderRequestError("Invalid local render options", 400);
	}
}

function checksum(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function validatedAssets(
	form: FormData,
	document: ProjectDocumentV2,
): Promise<ReadonlyMap<string, Uint8Array>> {
	const declared = new Map(document.project.assets.map((asset) => [asset.id, asset]));
	form.forEach((_value, name) => {
		if (!name.startsWith("asset:")) {
			return;
		}
		const assetId = name.slice("asset:".length);
		if (!declared.has(assetId)) {
			throw new LocalRenderRequestError("Request contains undeclared media", 400, { assetId });
		}
	});

	const result = new Map<string, Uint8Array>();
	let totalBytes = 0;
	for (const asset of document.project.assets) {
		const values = form.getAll(`asset:${asset.id}`);
		if (values.length !== 1 || !(values[0] instanceof File)) {
			throw new LocalRenderRequestError("Project media is missing", 400, { assetId: asset.id });
		}
		const file = values[0];
		if (file.type !== asset.mimeType) {
			throw new LocalRenderRequestError("Media type does not match the project metadata", 415, {
				assetId: asset.id,
			});
		}
		if (file.size > MAX_ASSET_BYTES || totalBytes + file.size > MAX_MULTIPART_BYTES) {
			throw new LocalRenderRequestError("Local render media is too large", 413, {
				assetId: asset.id,
			});
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		totalBytes += bytes.byteLength;
		if (bytes.byteLength !== asset.byteSize || checksum(bytes) !== asset.checksum) {
			throw new LocalRenderRequestError(
				"Media bytes do not match the project metadata",
				422,
				{ assetId: asset.id },
			);
		}
		result.set(asset.id, bytes);
	}
	return result;
}

async function validateRequest(form: FormData): Promise<ValidatedRequest> {
	const document = parseDocument(requiredStringPart(form, "document"));
	const options = parseOptions(requiredStringPart(form, "options"));
	const assets = await validatedAssets(form, document);
	return { document, options, assets };
}

function downloadStem(title: string): string {
	return (
		title
			.trim()
			.replace(/[^a-z0-9_-]+/gi, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "Typelapse"
	);
}

function requestError(error: LocalRenderRequestError): Response {
	return Response.json(
		{ error: error.message, ...(error.details ?? {}) },
		{ status: error.status },
	);
}

async function readAndValidateArtifact(
	artifact: HostedRenderTemporaryArtifact,
	options: HostedRenderOptions,
): Promise<Uint8Array> {
	const expectedMime = options.format === "mp4" ? "video/mp4" : "video/webm";
	if (artifact.mimeType !== expectedMime || artifact.byteSize <= 0) {
		throw new Error("Renderer returned an invalid artifact");
	}
	const bytes = new Uint8Array(await readFile(artifact.temporaryId));
	if (bytes.byteLength !== artifact.byteSize) {
		throw new Error("Renderer artifact size changed before download");
	}
	return bytes;
}

/**
 * Local-only synchronous multimedia renderer. It accepts the canonical V2
 * document and the exact local media bytes, renders with the same Remotion V2
 * composition as the hosted worker, and never creates an account or cloud job.
 */
export function createLocalMultimediaRenderRoute(
	input: LocalMultimediaRenderRouteOptions = {},
): Hono {
	const route = new Hono();
	const createRenderer = input.createRenderer ?? defaultRendererFactory;
	const compilerVersion = input.compilerVersion ?? "local-v2";

	route.post(
		"/render/v2",
		bodyLimit({
			maxSize: MAX_MULTIPART_BYTES,
			onError: (c) => c.json({ error: "Local render request is too large" }, 413),
		}),
		async (c) => {
			let validated: ValidatedRequest;
			try {
				validated = await validateRequest(await c.req.formData());
			} catch (error) {
				if (error instanceof LocalRenderRequestError) {
					return requestError(error);
				}
				return c.json({ error: "Invalid local render request" }, 400);
			}

			const assetBytes: LocalRenderAssetBytesPort = {
				async bytesFor(assetId) {
					const bytes = validated.assets.get(assetId);
					if (!bytes) {
						throw new Error(`Local render asset '${assetId}' is unavailable`);
					}
					return bytes;
				},
			};
			let artifact: HostedRenderTemporaryArtifact | null = null;
			const renderer = createRenderer(assetBytes);
			try {
				artifact = await renderer.render({
					jobId: `local_${randomUUID()}`,
					ownerId: "local",
					projectId: validated.document.project.id,
					revision: 1,
					document: validated.document,
					options: validated.options,
					compilerVersion,
					signal: c.req.raw.signal,
				});
				const bytes = await readAndValidateArtifact(artifact, validated.options);
				const extension = validated.options.format;
				const responseBody = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				) as ArrayBuffer;
				return new Response(responseBody, {
					status: 200,
					headers: {
						"Content-Type": artifact.mimeType,
						"Content-Length": String(bytes.byteLength),
						"Content-Disposition": `attachment; filename="${downloadStem(validated.document.project.title)}.${extension}"`,
						"Cache-Control": "no-store",
					},
				});
			} catch {
				return c.json({ error: "Local render failed" }, 500);
			} finally {
				if (artifact) {
					await renderer.cleanup(artifact).catch(() => undefined);
				}
			}
		},
	);

	return route;
}
