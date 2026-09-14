import type { AccountId } from "../../domain/ports/auth.port";
import { hydrateProjectDocument } from "../project/hydrate-project-document";
import {
	type AssetMetadataPayload,
	type ProjectDocumentV2,
	parseProjectDocument,
} from "../project/project-document";
import type { HostedProjectAssetResolverPort } from "./hosted-project-asset-resolver.port";

export type { HostedProjectAssetResolverPort } from "./hosted-project-asset-resolver.port";

const UNAVAILABLE_ASSETS_MESSAGE = "One or more project assets are unavailable";

export class HostedProjectAssetsUnavailableError extends Error {
	constructor() {
		super(UNAVAILABLE_ASSETS_MESSAGE);
		this.name = "HostedProjectAssetsUnavailableError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredAssetId(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error("Each asset needs an id");
	}
	return value;
}

function sortedAssetIds(document: unknown): {
	readonly document: Record<string, unknown>;
	readonly project: Record<string, unknown>;
	readonly assetIds: readonly string[];
} {
	if (!isRecord(document) || document.schemaVersion !== 2 || !isRecord(document.project)) {
		throw new Error("Hosted asset canonicalization requires a V2 project document");
	}
	const project = document.project;
	if (!Array.isArray(project.assets)) {
		throw new Error("V2 assets must be an array");
	}

	const declared = new Set<string>();
	const referenced = new Set<string>();
	for (const value of project.assets) {
		if (!isRecord(value)) {
			throw new Error("Each asset must be an object");
		}
		const id = requiredAssetId(value.id);
		if (declared.has(id)) {
			throw new Error(`Duplicate id '${id}'`);
		}
		declared.add(id);
	}

	if (Array.isArray(project.scenes)) {
		for (const scene of project.scenes) {
			if (!isRecord(scene) || !Array.isArray(scene.blocks)) {
				continue;
			}
			for (const block of scene.blocks) {
				if (
					isRecord(block) &&
					(block.kind === "image" || block.kind === "video") &&
					typeof block.assetId === "string" &&
					block.assetId.trim() !== ""
				) {
					referenced.add(block.assetId);
				}
			}
		}
	}
	if (Array.isArray(project.audioCues)) {
		for (const cue of project.audioCues) {
			if (isRecord(cue) && typeof cue.assetId === "string" && cue.assetId.trim() !== "") {
				referenced.add(cue.assetId);
			}
		}
	}

	const assetIds = [...declared, ...referenced].filter(
		(id, index, ids) => ids.indexOf(id) === index,
	);
	assetIds.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
	return { document, project, assetIds };
}

function canonicalMetadata(
	assetIds: readonly string[],
	resolved: Awaited<ReturnType<HostedProjectAssetResolverPort["resolveReadyForProject"]>>,
): AssetMetadataPayload[] {
	const byId = new Map(resolved.map((asset) => [asset.id, asset]));
	if (byId.size !== assetIds.length || resolved.length !== assetIds.length) {
		throw new HostedProjectAssetsUnavailableError();
	}
	return assetIds.map((id) => {
		const asset = byId.get(id);
		if (!asset) {
			throw new HostedProjectAssetsUnavailableError();
		}
		return { id, ...asset.metadata };
	});
}

export async function canonicalizeHostedProjectUpdate(input: {
	readonly ownerId: AccountId;
	readonly projectId: string;
	readonly document: unknown;
	readonly assets: HostedProjectAssetResolverPort;
}): Promise<ProjectDocumentV2> {
	const extracted = sortedAssetIds(input.document);
	let resolved: Awaited<ReturnType<HostedProjectAssetResolverPort["resolveReadyForProject"]>> = [];
	if (extracted.assetIds.length > 0) {
		try {
			resolved = await input.assets.resolveReadyForProject({
				ownerId: input.ownerId,
				projectId: input.projectId,
				assetIds: extracted.assetIds,
			});
		} catch {
			throw new HostedProjectAssetsUnavailableError();
		}
	}

	const candidate = {
		...extracted.document,
		schemaVersion: 2,
		project: {
			...extracted.project,
			id: input.projectId,
			assets: canonicalMetadata(extracted.assetIds, resolved),
		},
	};
	const parsed = parseProjectDocument(candidate);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Hosted project updates require a V2 project document");
	}
	hydrateProjectDocument(parsed.document);
	return parsed.document;
}
