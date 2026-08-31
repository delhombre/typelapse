import type { MediaFit, MediaFocalPoint } from "../../domain/entities/block";

export interface MediaSize {
	readonly width: number;
	readonly height: number;
}

export interface MediaRect extends MediaSize {
	readonly x: number;
	readonly y: number;
}

export interface MediaFitResult {
	readonly source: MediaRect;
	readonly destination: MediaRect;
}

export interface MediaPosition {
	readonly x: number;
	readonly y: number;
}

function assertPositiveSize(size: MediaSize, label: string): void {
	if (
		!Number.isFinite(size.width) ||
		!Number.isFinite(size.height) ||
		size.width <= 0 ||
		size.height <= 0
	) {
		throw new Error(`${label} dimensions must be positive finite numbers`);
	}
}

function assertFinitePosition(rect: MediaRect): void {
	if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) {
		throw new Error("Media box position must be finite");
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Shared object-fit/object-position math for DOM, Remotion and Canvas. Cover
 * returns the exact source crop; contain returns the exact letterboxed target.
 */
export function fitMediaToBox({
	source,
	box,
	fit,
	focalPoint,
}: {
	readonly source: MediaSize;
	readonly box: MediaRect;
	readonly fit: MediaFit;
	readonly focalPoint: MediaFocalPoint;
}): MediaFitResult {
	assertPositiveSize(source, "Media source");
	assertPositiveSize(box, "Media box");
	assertFinitePosition(box);
	if (
		!Number.isFinite(focalPoint.x) ||
		!Number.isFinite(focalPoint.y) ||
		focalPoint.x < 0 ||
		focalPoint.x > 1 ||
		focalPoint.y < 0 ||
		focalPoint.y > 1
	) {
		throw new Error("Media focal point must be between 0 and 1");
	}

	if (fit === "contain") {
		const scale = Math.min(box.width / source.width, box.height / source.height);
		const width = source.width * scale;
		const height = source.height * scale;
		return {
			source: { x: 0, y: 0, width: source.width, height: source.height },
			destination: {
				x: box.x + (box.width - width) / 2,
				y: box.y + (box.height - height) / 2,
				width,
				height,
			},
		};
	}

	const sourceAspect = source.width / source.height;
	const boxAspect = box.width / box.height;
	let cropWidth = source.width;
	let cropHeight = source.height;
	if (sourceAspect > boxAspect) {
		cropWidth = source.height * boxAspect;
	} else if (sourceAspect < boxAspect) {
		cropHeight = source.width / boxAspect;
	}
	const focalX = source.width * focalPoint.x;
	const focalY = source.height * focalPoint.y;
	return {
		source: {
			x: clamp(focalX - cropWidth / 2, 0, source.width - cropWidth),
			y: clamp(focalY - cropHeight / 2, 0, source.height - cropHeight),
			width: cropWidth,
			height: cropHeight,
		},
		destination: { ...box },
	};
}

/**
 * Convert the canonical crop/letterbox projection into the local rectangle of
 * the actual image or video element. DOM and Remotion use this same rectangle;
 * clipping belongs to the layer container, never to object-fit heuristics.
 */
export function projectFittedMediaRect({
	intrinsic,
	fit,
	container,
}: {
	readonly intrinsic: MediaSize;
	readonly fit: MediaFitResult;
	readonly container: MediaPosition;
}): MediaRect {
	assertPositiveSize(intrinsic, "Media source");
	assertPositiveSize(fit.source, "Media fit source");
	assertPositiveSize(fit.destination, "Media fit destination");
	if (!Number.isFinite(container.x) || !Number.isFinite(container.y)) {
		throw new Error("Media container position must be finite");
	}
	const scale = fit.destination.width / fit.source.width;
	return {
		x: fit.destination.x - container.x - fit.source.x * scale,
		y: fit.destination.y - container.y - fit.source.y * scale,
		width: intrinsic.width * scale,
		height: intrinsic.height * scale,
	};
}
