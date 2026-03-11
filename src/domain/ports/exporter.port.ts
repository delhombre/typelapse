import type { RenderFormat } from "../entities/render-config";

export interface ExporterPort {
	export(blob: Blob, filename: string, format: RenderFormat): Promise<void>;
}
