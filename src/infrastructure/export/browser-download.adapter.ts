import type { RenderFormat } from "@/domain/entities/render-config";
import type { ExporterPort } from "@/domain/ports/exporter.port";

/**
 * Browser-native file download exporter.
 * Creates a temporary object URL and triggers download via anchor click.
 */
export class BrowserDownloadAdapter implements ExporterPort {
	async export(blob: Blob, filename: string, format: RenderFormat | string): Promise<void> {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${filename}.${format}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
}
