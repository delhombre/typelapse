import type {
	PrivateAssetApiPort,
	PrivateMediaMetadataPort,
	PrivateMediaSha256Port,
	SignedPutPort,
} from "../../application/assets/private-media-upload.port";
import type { SceneAssetSourceRegistryPort } from "../../application/assets/scene-asset-source.port";
import {
	type UploadPrivateMedia,
	createUploadPrivateMedia,
} from "../../application/assets/upload-private-media";
import type { HostedProjectApiPort } from "../../application/project/hosted-project-api.port";
import {
	type HostedProjectSyncCoordinator,
	type HostedProjectSyncOptions,
	createHostedProjectSyncCoordinator,
} from "../../application/project/hosted-project-sync";
import type {
	ImportHostedMediaOptions,
	ImportHostedMediaResult,
} from "../../application/project/hosted-project-sync";
import {
	BrowserFileSha256Adapter,
	privateMediaFileFromBrowser,
} from "../assets/browser-file-hasher";
import { BrowserMediaMetadataAdapter } from "../assets/browser-media-metadata.adapter";
import {
	BrowserSignedPutAdapter,
	PrivateMediaHttpAdapter,
	createPrivateMediaIdempotencyKey,
} from "../assets/private-media-http.adapter";
import { HostedProjectHttpAdapter } from "./hosted-project-http.adapter";

export interface BrowserHostedProjectSyncRuntime extends HostedProjectSyncCoordinator {
	importFile(file: File, options?: ImportHostedMediaOptions): Promise<ImportHostedMediaResult>;
}

export interface BrowserHostedProjectSyncDependencies {
	readonly registry: SceneAssetSourceRegistryPort;
	readonly api?: HostedProjectApiPort;
	readonly assets?: PrivateAssetApiPort;
	readonly uploader?: UploadPrivateMedia;
	readonly hasher?: PrivateMediaSha256Port;
	readonly metadata?: PrivateMediaMetadataPort;
	readonly signedPut?: SignedPutPort;
	readonly fetcher?: typeof globalThis.fetch;
	readonly createIdempotencyKey?: () => string;
}

/**
 * Hosted-only browser composition root. Session cookies stay same-origin, File
 * stays opaque until infrastructure unwraps it, and signed GET URLs live only
 * in the supplied runtime registry.
 */
export function createBrowserHostedProjectSyncRuntime(
	dependencies: BrowserHostedProjectSyncDependencies,
	options: HostedProjectSyncOptions = {},
): BrowserHostedProjectSyncRuntime {
	const fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
	const assets = dependencies.assets ?? new PrivateMediaHttpAdapter({ fetcher });
	const uploader =
		dependencies.uploader ??
		createUploadPrivateMedia({
			hasher: dependencies.hasher ?? new BrowserFileSha256Adapter(),
			metadata: dependencies.metadata ?? new BrowserMediaMetadataAdapter(),
			api: assets,
			uploader: dependencies.signedPut ?? new BrowserSignedPutAdapter(),
			createIdempotencyKey: dependencies.createIdempotencyKey ?? createPrivateMediaIdempotencyKey,
		});
	const coordinator = createHostedProjectSyncCoordinator(
		{
			api: dependencies.api ?? new HostedProjectHttpAdapter({ fetcher }),
			assets,
			uploader,
			registry: dependencies.registry,
		},
		options,
	);

	return {
		connect: (input) => coordinator.connect(input),
		scheduleSave: (document) => coordinator.scheduleSave(document),
		flush: () => coordinator.flush(),
		importMedia: (file, importOptions) => coordinator.importMedia(file, importOptions),
		importFile: (file, importOptions) =>
			coordinator.importMedia(privateMediaFileFromBrowser(file), importOptions),
		refreshMediaSources: () => coordinator.refreshMediaSources(),
		getState: () => coordinator.getState(),
		subscribe: (listener) => coordinator.subscribe(listener),
		stop: () => coordinator.stop(),
	};
}
