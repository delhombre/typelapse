import type { RenderConfig } from "../entities/render-config";
import type { Snippet } from "../entities/snippet";

export interface RendererPort {
	renderPreview(snippet: Snippet): Promise<string>;
	renderVideo(snippet: Snippet, config: RenderConfig): Promise<Blob>;
}
