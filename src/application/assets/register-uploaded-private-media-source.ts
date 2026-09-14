import { PrivateMediaUploadError } from "./private-media-upload.port";
import type { SceneAssetSource, SceneAssetSourceRegistryPort } from "./scene-asset-source.port";
import type { UploadedPrivateMedia } from "./upload-private-media";

function invalidHostedSource(): never {
	throw new PrivateMediaUploadError(
		"invalid-response",
		"The uploaded media does not have valid private access.",
	);
}

/**
 * Keeps a newly uploaded asset's signed GET URL in the runtime registry only.
 * The durable project registration remains a separate metadata-only operation.
 */
export function registerUploadedPrivateMediaSource(
	registry: SceneAssetSourceRegistryPort,
	uploaded: UploadedPrivateMedia,
): SceneAssetSource {
	const { asset, access } = uploaded;
	if (
		asset.status !== "ready" ||
		!asset.id.trim() ||
		access.method !== "GET" ||
		!access.url.trim() ||
		access.url !== access.url.trim() ||
		access.url.startsWith("data:") ||
		access.url.startsWith("blob:") ||
		Number.isNaN(access.expiresAt.getTime())
	) {
		invalidHostedSource();
	}

	return registry.register({
		source: Object.freeze({ assetId: asset.id, src: access.url }),
		release: () => undefined,
	});
}
