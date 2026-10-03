import type { ProjectDocumentV2 } from "../project/project-document";

/**
 * Why this project cannot render on this device, in one sentence, or null when
 * it can.
 *
 * The painter draws code, text and image layers; video frames are a follow-up
 * (autonomous sprint D2). Refusing up front, before anything is decoded or
 * posted, is what keeps "Device" from quietly becoming the server.
 */
export function deviceExportRefusal(document: ProjectDocumentV2): string | null {
	const hasVideo = document.project.scenes.some((scene) =>
		scene.blocks.some((block) => block.kind === "video"),
	);
	return hasVideo
		? "This device cannot draw video layers yet; choose Server under Where to render this project."
		: null;
}
