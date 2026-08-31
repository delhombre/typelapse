import type { AssetMetadataPayload, ProjectDocumentV2, TextBlockPayload } from "./project-document";
import { parseProjectDocument } from "./project-document";

const SEED_SCENE_ID = "typelapse-private-cloud-seed-scene";
const SEED_BLOCK_ID = "typelapse-private-cloud-seed-block";

export interface HostedAssetMapping {
	readonly localAssetId: string;
	readonly hostedAsset: AssetMetadataPayload;
}

function canonical(input: ProjectDocumentV2): ProjectDocumentV2 {
	const parsed = parseProjectDocument(input);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Cloud publishing requires a V2 project");
	}
	return parsed.document;
}

function seedBlock(): TextBlockPayload {
	return {
		id: SEED_BLOCK_ID,
		kind: "text",
		opacity: 1,
		placement: { x: 0.16, y: 0.38, width: 0.68, height: 0.24 },
		text: "Preparing your private project…",
		typography: {
			fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
			fontSize: 72,
			fontWeight: 600,
			color: "#fffaf0",
			align: "center",
		},
	};
}

/**
 * Creates the smallest valid hosted project before any private bytes move.
 * Project creation intentionally rejects asset descriptors: the project must
 * exist before object storage can reserve owner-scoped media for it.
 */
export function createHostedProjectSeed(input: ProjectDocumentV2): ProjectDocumentV2 {
	const local = canonical(input);
	const scenes = local.project.scenes.map((scene) => ({
		...scene,
		blocks: scene.blocks.filter((block) => block.kind === "text" || block.kind === "code"),
	}));
	const hasVisual = scenes.some((scene) => scene.blocks.length > 0);
	if (!hasVisual) {
		if (scenes[0]) {
			scenes[0] = { ...scenes[0], blocks: [seedBlock()] };
		} else {
			scenes.push({ id: SEED_SCENE_ID, durationMs: 2_000, blocks: [seedBlock()] });
		}
	}
	return canonical({
		...local,
		project: {
			...local.project,
			assets: [],
			audioCues: [],
			scenes,
		},
	});
}

/** Replaces every local media id with the corresponding server-owned asset. */
export function remapHostedProjectAssets(
	input: ProjectDocumentV2,
	options: {
		readonly projectId: string;
		readonly assets: readonly HostedAssetMapping[];
	},
): ProjectDocumentV2 {
	const local = canonical(input);
	const byLocalId = new Map(options.assets.map((mapping) => [mapping.localAssetId, mapping]));
	if (
		byLocalId.size !== local.project.assets.length ||
		local.project.assets.some((asset) => !byLocalId.has(asset.id))
	) {
		throw new Error("Every local media asset must be uploaded before cloud save");
	}
	const hostedId = (localAssetId: string): string => {
		const mapping = byLocalId.get(localAssetId);
		if (!mapping) {
			throw new Error("Every local media asset must be uploaded before cloud save");
		}
		return mapping.hostedAsset.id;
	};
	return canonical({
		...local,
		project: {
			...local.project,
			id: options.projectId,
			assets: local.project.assets.map((asset) => {
				const mapping = byLocalId.get(asset.id);
				if (!mapping) {
					throw new Error("Every local media asset must be uploaded before cloud save");
				}
				return mapping.hostedAsset;
			}),
			audioCues: local.project.audioCues.map((cue) => ({
				...cue,
				assetId: hostedId(cue.assetId),
			})),
			scenes: local.project.scenes.map((scene) => ({
				...scene,
				blocks: scene.blocks.map((block) => {
					if (block.kind !== "image" && block.kind !== "video") return block;
					return { ...block, assetId: hostedId(block.assetId) };
				}),
			})),
		},
	});
}
