import type { ProjectDocumentV2 } from "../project/project-document";
import type { HostedRenderOptions } from "./hosted-render-job";

export interface LocalMultimediaRenderClientPort {
	render(input: {
		readonly document: ProjectDocumentV2;
		readonly options: HostedRenderOptions;
		readonly signal?: AbortSignal;
	}): Promise<Blob>;
}
