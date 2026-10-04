import type { ProjectDocumentV2 } from "../../../src/application/project/project-document";
import type { RenderInput } from "../types";

export interface RemotionV2CompositionInput {
	readonly document: ProjectDocumentV2;
	readonly assetSources: readonly {
		readonly assetId: string;
		readonly publicPath: string;
	}[];
	readonly includeAudio: boolean;
	/** Loop on: the file ends on the morph from the last scene back to the first. */
	readonly loop?: boolean;
	/**
	 * The studio's code card, laid out in Node (`buildCodeCardInput`) and drawn by
	 * the code-only composition's `CodeCard` between the layer slots. Absent when
	 * a scene has no code.
	 */
	readonly card?: RenderInput;
}
