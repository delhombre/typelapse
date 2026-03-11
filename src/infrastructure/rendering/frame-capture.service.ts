import { toPng } from "html-to-image";

export interface CaptureOptions {
	/** Target width for the captured image */
	width: number;
	/** Target height (auto if not specified) */
	height?: number;
	/** Pixel ratio for retina quality */
	pixelRatio?: number;
	/** Background color behind the frame */
	backgroundColor?: string;
}

/**
 * Captures a DOM element as a PNG image.
 * Uses html-to-image under the hood.
 */
export async function captureElementAsImage(
	element: HTMLElement,
	options: CaptureOptions,
): Promise<HTMLImageElement> {
	const dataUrl = await toPng(element, {
		width: options.width,
		height: options.height,
		pixelRatio: options.pixelRatio ?? 2,
		backgroundColor: options.backgroundColor,
		cacheBust: true,
	});

	return loadImage(dataUrl);
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}
