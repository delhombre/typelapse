import type { AssetMetadata } from "../../domain/entities/asset";
import type { AccountId } from "../../domain/ports/auth.port";

export interface ReadyHostedProjectAsset {
	readonly id: string;
	readonly metadata: AssetMetadata;
}

/**
 * Read boundary used while accepting a hosted project document.
 *
 * The adapter must apply owner, project and ready-status predicates together.
 * Missing, foreign and non-ready ids are all represented by their absence from
 * the result, so callers cannot turn this port into an asset existence oracle.
 */
export interface HostedProjectAssetResolverPort {
	resolveReadyForProject(input: {
		readonly ownerId: AccountId;
		readonly projectId: string;
		readonly assetIds: readonly string[];
	}): Promise<readonly ReadyHostedProjectAsset[]>;
}
