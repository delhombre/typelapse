import type { ProjectDocumentV2 } from "./project-document";
import { parseProjectDocument } from "./project-document";

export interface StarterMultimediaProjectIds {
	readonly projectId?: string;
	readonly sceneId?: string;
	readonly textBlockId?: string;
}

function id(explicit: string | undefined): string {
	return explicit ?? crypto.randomUUID();
}

/**
 * The honest blank state of the multimedia product: one scene, one editable
 * text layer and no implied GitHub workflow. Code and media are additions, not
 * prerequisites.
 */
export function createStarterMultimediaProject(
	ids: StarterMultimediaProjectIds = {},
): ProjectDocumentV2 {
	const document: ProjectDocumentV2 = {
		schemaVersion: 2,
		project: {
			id: id(ids.projectId),
			title: "Untitled story",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: id(ids.sceneId),
					durationMs: 3_200,
					blocks: [
						{
							id: id(ids.textBlockId),
							kind: "text",
							opacity: 1,
							placement: { x: 0.12, y: 0.29, width: 0.76, height: 0.42 },
							text: "Make something worth watching.",
							typography: {
								fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
								fontSize: 112,
								fontWeight: 650,
								color: "#fffaf0",
								align: "center",
							},
						},
					],
				},
			],
		},
	};
	const parsed = parseProjectDocument(document);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Starter project must be V2");
	}
	return parsed.document;
}
