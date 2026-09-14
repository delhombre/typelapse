export interface SurfaceSize {
	readonly width: number;
	readonly height: number;
}

export interface FittedSceneSurface extends SurfaceSize {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

function assertSize(size: SurfaceSize, label: string): void {
	if (
		!Number.isFinite(size.width) ||
		!Number.isFinite(size.height) ||
		size.width <= 0 ||
		size.height <= 0
	) {
		throw new Error(`${label} dimensions must be positive`);
	}
}

/** Pure contain-fit shared by the browser stage and hosted composition shell. */
export function fitSceneSurface(surface: SurfaceSize, viewport: SurfaceSize): FittedSceneSurface {
	assertSize(surface, "Scene surface");
	assertSize(viewport, "Scene viewport");
	const widthScale = viewport.width / surface.width;
	const heightScale = viewport.height / surface.height;
	const widthLimited = widthScale <= heightScale;
	const scale = widthLimited ? widthScale : heightScale;
	const width = widthLimited ? viewport.width : surface.width * scale;
	const height = widthLimited ? surface.height * scale : viewport.height;
	return {
		scale,
		x: widthLimited ? 0 : (viewport.width - width) / 2,
		y: widthLimited ? (viewport.height - height) / 2 : 0,
		width,
		height,
	};
}
