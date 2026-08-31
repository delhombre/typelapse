import type { ProjectDocumentV2 } from "../../../src/application/project/project-document";

export interface RemotionV2CompositionInput {
	readonly document: ProjectDocumentV2;
	readonly assetSources: readonly {
		readonly assetId: string;
		readonly publicPath: string;
	}[];
	readonly includeAudio: boolean;
}
