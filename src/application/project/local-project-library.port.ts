import type { ProjectDocumentV2 } from "./project-document";

export interface LocalAssetContentInput {
	readonly projectId: string;
	readonly assetId: string;
	readonly mimeType: string;
	readonly byteSize: number;
	/** Browser-owned file/blob handle; application code never unwraps it. */
	readonly opaqueHandle: unknown;
}

export interface LocalAssetContent {
	readonly assetId: string;
	readonly mimeType: string;
	readonly byteSize: number;
	readonly opaqueHandle: unknown;
}

export interface LocalProjectLibraryPort {
	loadCurrent(): Promise<ProjectDocumentV2 | null>;
	saveProject(document: ProjectDocumentV2): Promise<void>;
	loadAsset(input: {
		readonly projectId: string;
		readonly assetId: string;
	}): Promise<LocalAssetContent | null>;
	saveAsset(input: LocalAssetContentInput): Promise<void>;
}
