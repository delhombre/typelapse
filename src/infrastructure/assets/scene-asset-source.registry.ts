import type {
	SceneAssetSource,
	SceneAssetSourceLease,
	SceneAssetSourceRegistryPort,
} from "../../application/assets/scene-asset-source.port";

function assertLease(lease: SceneAssetSourceLease): void {
	if (!lease.source.assetId.trim() || !lease.source.src.trim()) {
		throw new Error("A scene asset source requires an asset id and a URL.");
	}
}

function releaseSafely(lease: SceneAssetSourceLease): void {
	try {
		lease.release();
	} catch {}
}

/** In-memory only: no storage or serialization surface is exposed. */
export function createSceneAssetSourceRegistry(): SceneAssetSourceRegistryPort {
	const entries = new Map<string, SceneAssetSourceLease>();

	return {
		register(lease): SceneAssetSource {
			assertLease(lease);
			const previous = entries.get(lease.source.assetId);
			entries.set(lease.source.assetId, lease);
			if (previous && previous !== lease) {
				releaseSafely(previous);
			}
			return lease.source;
		},
		resolve(assetId): SceneAssetSource | null {
			return entries.get(assetId)?.source ?? null;
		},
		revoke(assetId): boolean {
			const lease = entries.get(assetId);
			if (!lease) {
				return false;
			}
			entries.delete(assetId);
			releaseSafely(lease);
			return true;
		},
		revokeAll(): void {
			const leases = [...entries.values()];
			entries.clear();
			for (const lease of leases) {
				releaseSafely(lease);
			}
		},
	};
}
