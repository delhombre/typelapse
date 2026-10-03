import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSafeBackground } from "../../../src/application/backgrounds/mesh-gradient";
import {
	type AssetMetadataPayload,
	type ProjectDocumentV2,
	parseProjectDocument,
} from "../../../src/application/project/project-document";
import type {
	HostedMultimediaRendererPort,
	HostedRenderTemporaryArtifact,
} from "../../../src/application/render/process-hosted-render-job";
import {
	compileSceneTimeline,
	hasAudibleMedia,
} from "../../../src/application/render/scene-timeline";
import {
	JPEG_QUALITY,
	SERVER_VIDEO_COLOR_SPACE,
	videoColorOverride,
} from "../../remotion/output-settings";
import type { RemotionV2CompositionInput } from "../../remotion/v2/types";
import { buildCodeCardInput } from "./code-card-input";

export interface HostedRenderAssetMaterializerPort {
	/** Writes the private object to the exact adapter-owned destination. */
	materializePrivateAsset(input: {
		readonly ownerId: string;
		readonly projectId: string;
		readonly assetId: string;
		readonly destinationPath: string;
		readonly signal: AbortSignal;
	}): Promise<void>;
}

export interface RemotionV2RuntimePort {
	bundle(input: {
		readonly entryPoint: string;
		readonly publicDir: string;
		readonly outDir: string;
		readonly signal: AbortSignal;
	}): Promise<string>;
	selectComposition(input: {
		readonly serveUrl: string;
		readonly compositionId: "TypelapseV2";
		readonly inputProps: { readonly input: RemotionV2CompositionInput };
		readonly signal: AbortSignal;
	}): Promise<unknown>;
	renderMedia(input: {
		readonly serveUrl: string;
		readonly composition: unknown;
		readonly inputProps: { readonly input: RemotionV2CompositionInput };
		readonly outputPath: string;
		readonly format: "mp4" | "webm";
		readonly width: number;
		readonly height: number;
		readonly fps: number;
		readonly durationInFrames: number;
		readonly includeAudio: boolean;
		readonly signal: AbortSignal;
	}): Promise<void>;
}

type RemotionCancelSignal = (callback: () => void) => void;

export interface RemotionV2RuntimeApiPort {
	bundle(input: {
		readonly entryPoint: string;
		readonly publicDir: string;
		readonly outDir: string;
	}): Promise<string>;
	selectComposition(input: {
		readonly serveUrl: string;
		readonly id: "TypelapseV2";
		readonly inputProps: { readonly input: RemotionV2CompositionInput };
	}): Promise<unknown>;
	renderMedia(input: {
		readonly serveUrl: string;
		readonly composition: Readonly<Record<string, unknown>>;
		readonly inputProps: { readonly input: RemotionV2CompositionInput };
		readonly codec: "h264" | "vp8";
		readonly outputLocation: string;
		readonly pixelFormat: "yuv420p";
		readonly colorSpace: typeof SERVER_VIDEO_COLOR_SPACE;
		readonly ffmpegOverride: (input: {
			readonly type: "pre-stitcher" | "stitcher";
			readonly args: string[];
		}) => string[];
		readonly imageFormat: "jpeg";
		readonly jpegQuality: number;
		readonly overwrite: true;
		readonly muted: boolean;
		readonly cancelSignal: RemotionCancelSignal;
	}): Promise<unknown>;
}

const REMOTION_API: RemotionV2RuntimeApiPort = {
	async bundle(input) {
		const { bundle } = await import("@remotion/bundler");
		return bundle(input);
	},
	async selectComposition(input) {
		const { selectComposition } = await import("@remotion/renderer");
		return selectComposition(input);
	},
	async renderMedia(input) {
		const { renderMedia } = await import("@remotion/renderer");
		return renderMedia(input as unknown as Parameters<typeof renderMedia>[0]);
	},
};

function compositionRecord(composition: unknown): Readonly<Record<string, unknown>> {
	if (typeof composition !== "object" || composition === null || Array.isArray(composition)) {
		throw new Error("Remotion returned an invalid V2 composition");
	}
	return composition as Readonly<Record<string, unknown>>;
}

export function createRemotionV2Runtime(
	api: RemotionV2RuntimeApiPort = REMOTION_API,
): RemotionV2RuntimePort {
	return {
		async bundle(input) {
			input.signal.throwIfAborted();
			const serveUrl = await api.bundle({
				entryPoint: input.entryPoint,
				publicDir: input.publicDir,
				outDir: input.outDir,
			});
			input.signal.throwIfAborted();
			return serveUrl;
		},

		async selectComposition(input) {
			input.signal.throwIfAborted();
			const composition = await api.selectComposition({
				serveUrl: input.serveUrl,
				id: input.compositionId,
				inputProps: input.inputProps,
			});
			input.signal.throwIfAborted();
			return composition;
		},

		async renderMedia(input) {
			input.signal.throwIfAborted();
			const callbacks = new Set<() => void>();
			const cancel = () => {
				for (const callback of callbacks) {
					callback();
				}
			};
			input.signal.addEventListener("abort", cancel, { once: true });
			const cancelSignal: RemotionCancelSignal = (callback) => {
				callbacks.add(callback);
				if (input.signal.aborted) {
					callback();
				}
			};
			try {
				await api.renderMedia({
					serveUrl: input.serveUrl,
					composition: {
						...compositionRecord(input.composition),
						width: input.width,
						height: input.height,
						fps: input.fps,
						durationInFrames: input.durationInFrames,
					},
					inputProps: input.inputProps,
					codec: input.format === "mp4" ? "h264" : "vp8",
					outputLocation: input.outputPath,
					pixelFormat: "yuv420p",
					colorSpace: SERVER_VIDEO_COLOR_SPACE,
					ffmpegOverride: ({ args }) => videoColorOverride(args),
					imageFormat: "jpeg",
					jpegQuality: JPEG_QUALITY,
					overwrite: true,
					muted: !input.includeAudio,
					cancelSignal,
				});
				input.signal.throwIfAborted();
			} finally {
				input.signal.removeEventListener("abort", cancel);
				callbacks.clear();
			}
		},
	};
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"image/gif": ".gif",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
	"audio/mpeg": ".mp3",
	"audio/mp4": ".m4a",
	"audio/wav": ".wav",
	"audio/x-wav": ".wav",
	"audio/webm": ".webm",
	"audio/ogg": ".ogg",
	"audio/flac": ".flac",
};

function canonicalDocument(value: unknown): ProjectDocumentV2 {
	const parsed = parseProjectDocument(value);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Hosted Remotion renderer requires a V2 project snapshot");
	}
	return parsed.document;
}

function referencedAssetIds(document: ProjectDocumentV2, includeAudio: boolean): readonly string[] {
	const ids = new Set<string>();
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "image" || block.kind === "video") {
				ids.add(block.assetId);
			}
		}
	}
	if (includeAudio) {
		for (const cue of document.project.audioCues) {
			ids.add(cue.assetId);
		}
	}
	return [...ids];
}

async function sha256File(filePath: string, signal: AbortSignal): Promise<string> {
	const hash = createHash("sha256");
	const stream = createReadStream(filePath, { signal });
	for await (const chunk of stream) {
		hash.update(chunk as Buffer);
	}
	return hash.digest("hex");
}

async function validateMaterializedAsset(input: {
	readonly asset: AssetMetadataPayload;
	readonly destinationPath: string;
	readonly signal: AbortSignal;
}): Promise<void> {
	const stats = await lstat(input.destinationPath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw new Error(`Private render asset '${input.asset.id}' is not a regular file`);
	}
	if (stats.size !== input.asset.byteSize) {
		throw new Error(`Private render asset '${input.asset.id}' has an unexpected byte size`);
	}
	if ((await sha256File(input.destinationPath, input.signal)) !== input.asset.checksum) {
		throw new Error(`Private render asset '${input.asset.id}' failed checksum verification`);
	}
}

function sanitizedRenderDocument(
	document: ProjectDocumentV2,
	publicNames: ReadonlyMap<string, string>,
): ProjectDocumentV2 {
	return {
		...document,
		project: {
			...document.project,
			canvas: {
				...document.project.canvas,
				background:
					isSafeBackground(document.project.canvas.background) &&
					!document.project.canvas.background.startsWith("image:")
						? document.project.canvas.background
						: "#111111",
			},
			assets: document.project.assets.map((asset) => ({
				...asset,
				fileName: publicNames.get(asset.id) ?? `unused-${asset.kind}`,
			})),
		},
	};
}

function outputMimeType(format: "mp4" | "webm"): string {
	return format === "mp4" ? "video/mp4" : "video/webm";
}

export function createHostedRemotionV2Renderer(input: {
	readonly assets: HostedRenderAssetMaterializerPort;
	readonly runtime?: RemotionV2RuntimePort;
	readonly temporaryRoot?: string;
	readonly entryPoint?: string;
}): HostedMultimediaRendererPort {
	const temporaryRoot = path.resolve(input.temporaryRoot ?? os.tmpdir());
	const entryPoint = input.entryPoint ?? path.resolve(process.cwd(), "server/remotion/v2/root.tsx");
	const runtime = input.runtime ?? createRemotionV2Runtime();
	const managedWorkspaces = new Map<string, string>();

	return {
		async render(renderInput) {
			renderInput.signal.throwIfAborted();
			await mkdir(temporaryRoot, { recursive: true });
			const workspace = await mkdtemp(path.join(temporaryRoot, "typelapse-v2-render-"));
			const publicDir = path.join(workspace, "public");
			const assetsDir = path.join(publicDir, "assets");
			const outDir = path.join(workspace, "bundle");
			const outputPath = path.join(workspace, `output.${renderInput.options.format}`);
			try {
				const document = canonicalDocument(renderInput.document);
				if (document.project.id !== renderInput.projectId) {
					throw new Error("Hosted render project identity does not match its V2 snapshot");
				}
				const includeAudio = renderInput.options.includeAudio && hasAudibleMedia(document);
				const loop = renderInput.options.loop === true;
				const byId = new Map(document.project.assets.map((asset) => [asset.id, asset]));
				const assetSources: { assetId: string; publicPath: string }[] = [];
				const publicNames = new Map<string, string>();
				await mkdir(assetsDir, { recursive: true });
				for (const [index, assetId] of referencedAssetIds(document, includeAudio).entries()) {
					const asset = byId.get(assetId);
					if (!asset) {
						throw new Error(`Hosted render references missing asset '${assetId}'`);
					}
					const extension = MIME_EXTENSIONS[asset.mimeType];
					if (!extension) {
						throw new Error(`Hosted render asset '${assetId}' has an unsupported MIME type`);
					}
					const publicName = `asset-${index}${extension}`;
					const destinationPath = path.join(assetsDir, publicName);
					await input.assets.materializePrivateAsset({
						ownerId: renderInput.ownerId,
						projectId: renderInput.projectId,
						assetId,
						destinationPath,
						signal: renderInput.signal,
					});
					renderInput.signal.throwIfAborted();
					await validateMaterializedAsset({ asset, destinationPath, signal: renderInput.signal });
					const publicPath = `assets/${publicName}`;
					assetSources.push({ assetId, publicPath });
					publicNames.set(assetId, publicName);
				}

				const timeline = compileSceneTimeline({ document, fps: renderInput.options.fps, loop });
				const renderDocument = sanitizedRenderDocument(document, publicNames);
				const card = await buildCodeCardInput({ document: renderDocument, loop });
				renderInput.signal.throwIfAborted();
				const compositionInput: RemotionV2CompositionInput = {
					document: renderDocument,
					assetSources,
					includeAudio,
					loop,
					...(card ? { card } : {}),
				};
				const inputProps = { input: compositionInput } as const;
				const serveUrl = await runtime.bundle({
					entryPoint,
					publicDir,
					outDir,
					signal: renderInput.signal,
				});
				renderInput.signal.throwIfAborted();
				const composition = await runtime.selectComposition({
					serveUrl,
					compositionId: "TypelapseV2",
					inputProps,
					signal: renderInput.signal,
				});
				renderInput.signal.throwIfAborted();
				await runtime.renderMedia({
					serveUrl,
					composition,
					inputProps,
					outputPath,
					format: renderInput.options.format,
					width: renderInput.options.width,
					height: renderInput.options.height,
					fps: renderInput.options.fps,
					durationInFrames: timeline.totalFrames,
					includeAudio,
					signal: renderInput.signal,
				});
				renderInput.signal.throwIfAborted();
				const outputStats = await lstat(outputPath);
				if (!outputStats.isFile() || outputStats.isSymbolicLink() || outputStats.size <= 0) {
					throw new Error("Remotion did not produce a regular non-empty output file");
				}
				managedWorkspaces.set(outputPath, workspace);
				return {
					temporaryId: outputPath,
					mimeType: outputMimeType(renderInput.options.format),
					byteSize: outputStats.size,
				} satisfies HostedRenderTemporaryArtifact;
			} catch (error) {
				await rm(workspace, { recursive: true, force: true });
				throw error;
			}
		},

		async cleanup(artifact) {
			const workspace = managedWorkspaces.get(artifact.temporaryId);
			if (!workspace) {
				return;
			}
			managedWorkspaces.delete(artifact.temporaryId);
			await rm(workspace, { recursive: true, force: true });
		},
	};
}
