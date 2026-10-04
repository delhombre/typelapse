/**
 * The images a studio project's layers show, decoded for the render worker.
 *
 * The bytes live in the local asset store (IndexedDB), never in the document.
 * They are decoded here, in the tab that owns the store, and the bitmaps are
 * transferred to the worker with the job, so nothing is fetched, uploaded or
 * copied twice. An image this browser does not have refuses the export with the
 * same sentence the server path uses, before a frame is painted.
 */

import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { ClientExportImage } from "./client-export-job";

type Decode = (blob: Blob) => Promise<ImageBitmap>;

export async function decodeCompositionImages(
	document: ProjectDocumentV2,
	library: Pick<LocalProjectLibraryPort, "loadAsset">,
	decode: Decode = (blob) => createImageBitmap(blob),
): Promise<ClientExportImage[]> {
	const shown = new Set<string>();
	for (const scene of document.project.scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "image") {
				shown.add(block.assetId);
			}
		}
	}
	const assets = document.project.assets.filter(
		(asset) => asset.kind === "image" && shown.has(asset.id),
	);
	return await Promise.all(
		assets.map(async (asset) => {
			const content = await library.loadAsset({
				projectId: document.project.id,
				assetId: asset.id,
			});
			if (!content || !(content.opaqueHandle instanceof Blob)) {
				throw new Error(`${asset.fileName} is unavailable on this device.`);
			}
			return { assetId: asset.id, bitmap: await decode(content.opaqueHandle) };
		}),
	);
}
