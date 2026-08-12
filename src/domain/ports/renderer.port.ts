import type { RenderConfig } from "../entities/render-config";
import type { Snippet } from "../entities/snippet";

/**
 * How far along a render is.
 *
 * A hosted render can afford to say "rendering…" and nothing else, because the
 * waiting happens on someone else's machine. A render that runs in the user's
 * own tab cannot: the wait is theirs, they can see the tab, and a spinner with
 * no denominator reads as a hang. So progress is part of the port rather than
 * an adapter's private affair.
 */
export interface RenderProgress {
	phase: "preparing" | "encoding" | "finalizing";
	completedFrames: number;
	totalFrames: number;
	/** 0..1, already divided so a caller never has to guard against zero frames. */
	ratio: number;
}

export interface RenderVideoOptions {
	onProgress?: (progress: RenderProgress) => void;
	/** Abort a render in flight; the promise rejects and the encoder is torn down. */
	signal?: AbortSignal;
}

export interface RendererPort {
	renderPreview(snippet: Snippet): Promise<string>;
	renderVideo(snippet: Snippet, config: RenderConfig, options?: RenderVideoOptions): Promise<Blob>;
}
