import type { PrivateMediaFile, PrivateMediaPortOptions } from "./private-media-upload.port";

/**
 * Runtime-only media location consumed by MultimediaSceneFrame. It deliberately
 * lives outside Asset and every project document.
 */
export interface SceneAssetSource {
	readonly assetId: string;
	readonly src: string;
}

/** Owns one ephemeral source until the registry releases it. */
export interface SceneAssetSourceLease {
	readonly source: SceneAssetSource;
	release(): void;
}

export interface SceneAssetSourceRegistryPort {
	register(lease: SceneAssetSourceLease): SceneAssetSource;
	resolve(assetId: string): SceneAssetSource | null;
	revoke(assetId: string): boolean;
	revokeAll(): void;
}

/** Browser implementations may unwrap the opaque handle to create an object URL. */
export interface LocalSceneAssetSourceFactoryPort {
	create(
		assetId: string,
		file: PrivateMediaFile,
		options: PrivateMediaPortOptions,
	): SceneAssetSourceLease;
}
