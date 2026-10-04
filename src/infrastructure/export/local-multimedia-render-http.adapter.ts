import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import type { LocalMultimediaRenderClientPort } from "@/application/render/local-multimedia-render-client.port";

function responseMessage(body: unknown): string {
	if (
		typeof body === "object" &&
		body !== null &&
		!Array.isArray(body) &&
		typeof (body as Record<string, unknown>).error === "string"
	) {
		return (body as { readonly error: string }).error;
	}
	return "The local renderer could not finish this video.";
}

/** Sends local-only project bytes to the same-origin account-free Remotion V2 route. */
export class LocalMultimediaRenderHttpAdapter implements LocalMultimediaRenderClientPort {
	constructor(
		private readonly library: Pick<LocalProjectLibraryPort, "loadAsset">,
		private readonly fetcher: typeof fetch = fetch,
	) {}

	async render(input: Parameters<LocalMultimediaRenderClientPort["render"]>[0]): Promise<Blob> {
		const form = new FormData();
		form.set("document", JSON.stringify(input.document));
		form.set("options", JSON.stringify(input.options));
		for (const asset of input.document.project.assets) {
			const content = await this.library.loadAsset({
				projectId: input.document.project.id,
				assetId: asset.id,
			});
			if (!content || !(content.opaqueHandle instanceof Blob)) {
				throw new Error(`${asset.fileName} is unavailable on this device.`);
			}
			form.set(
				`asset:${asset.id}`,
				new File([content.opaqueHandle], asset.fileName, { type: asset.mimeType }),
			);
		}

		const response = await this.fetcher.call(globalThis, "/api/render/v2", {
			method: "POST",
			body: form,
			credentials: "same-origin",
			...(input.signal ? { signal: input.signal } : {}),
		});
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(responseMessage(body));
		}
		const expectedMime = input.options.format === "mp4" ? "video/mp4" : "video/webm";
		const contentType = response.headers.get("content-type")?.split(";", 1)[0];
		if (contentType !== expectedMime) {
			throw new Error("The local renderer returned an unexpected file type.");
		}
		const blob = await response.blob();
		if (blob.size <= 0) {
			throw new Error("The local renderer returned an empty video.");
		}
		return blob.type === expectedMime ? blob : new Blob([blob], { type: expectedMime });
	}
}
