import type { ProjectDocumentV2 } from "../project/project-document";

/**
 * The containers the worker's demuxer (mediabunny) reads. The studio ingests
 * MP4, MOV and WebM; a project file can name anything `video/`, and a file the
 * demuxer cannot open has no frames to draw.
 */
const READABLE_VIDEO_CONTAINERS = new Set([
	"video/mp4",
	"video/quicktime",
	"video/webm",
	"video/x-matroska",
	"video/ogg",
	"video/mp2t",
]);

const OFFER_SERVER = "choose Server under Where to render this project.";

/**
 * Why this project cannot render on this device, in one sentence, or null when
 * it can.
 *
 * The painter draws code, text, image and video layers. What the document alone
 * can tell is whether each video's container is one the demuxer reads; whether
 * this browser has a decoder for the codec inside is asked by the worker before
 * the first frame (`undecodableVideoRefusal`). Refusing up front, before
 * anything is decoded or posted, is what keeps "Device" from quietly becoming
 * the server.
 */
export function deviceExportRefusal(document: ProjectDocumentV2): string | null {
	const { assets, scenes } = document.project;
	for (const scene of scenes) {
		for (const block of scene.blocks) {
			if (block.kind !== "video") {
				continue;
			}
			const asset = assets.find((candidate) => candidate.id === block.assetId);
			if (asset && !READABLE_VIDEO_CONTAINERS.has(asset.mimeType.toLowerCase())) {
				return `This device cannot read ${asset.fileName}; ${OFFER_SERVER}`;
			}
		}
	}
	return null;
}

/** The worker's sentence for a video whose codec this browser has no decoder for. */
export function undecodableVideoRefusal(fileName: string): string {
	return `This browser cannot decode ${fileName}; ${OFFER_SERVER}`;
}
