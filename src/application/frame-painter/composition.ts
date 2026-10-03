/**
 * One frame of the scene compiler, turned into what the painter draws around
 * the code card.
 *
 * The compiler (`compileSceneTimeline`) already resolved the layer order, the
 * transition weights and the magic-move placements; the DOM preview and the
 * Remotion composition read the same frame. This only lays it out for a
 * canvas: boxes in project canvas pixels, the shared media fit, the shared text
 * visual, and the side of the card each layer belongs to.
 */

import { fitMediaToBox, projectFittedMediaRect } from "../layout/media-fit";
import type { ProjectDocumentV2 } from "../project/project-document";
import { compositionSlot, primaryCodeOpacity } from "../render/composition-slots";
import { projectTextLayerVisual } from "../render/scene-layer-visuals";
import type { ResolvedSceneLayer, SceneTimelineFrame } from "../render/scene-timeline";
import type { LayeredFrame, PaintBox, PaintLayer } from "./layers";
import type { PaintImage } from "./paint-context";

/**
 * @param images Decoded images by asset id. An image layer whose asset is not
 *   here is left out, which the caller prevents by refusing the export first.
 * @param canvasWidth The export canvas's width, which the project canvas is
 *   scaled to as one surface, as the preview scales it into its aspect box.
 */
export function layeredFrameAt(
	document: ProjectDocumentV2,
	frame: SceneTimelineFrame,
	images: ReadonlyMap<string, PaintImage>,
	canvasWidth: number,
): Omit<LayeredFrame, "scratch"> {
	const under: PaintLayer[] = [];
	const over: PaintLayer[] = [];
	for (const layer of frame.layers) {
		// The card is painted by the painter itself; any other code block is not
		// drawn by the preview either.
		if (layer.kind === "code") {
			continue;
		}
		const painted = paintLayerFor(document, layer, images);
		if (!painted) {
			continue;
		}
		(compositionSlot(document, layer) === "under-code" ? under : over).push(painted);
	}

	return {
		surfaceScale: canvasWidth / document.project.canvas.width,
		under,
		over,
		codeOpacity: primaryCodeOpacity(frame),
	};
}

function paintLayerFor(
	document: ProjectDocumentV2,
	layer: Exclude<ResolvedSceneLayer, { kind: "code" }>,
	images: ReadonlyMap<string, PaintImage>,
): PaintLayer | null {
	const { canvas } = document.project;
	const box: PaintBox = {
		x: layer.placement.x * canvas.width,
		y: layer.placement.y * canvas.height,
		width: layer.placement.width * canvas.width,
		height: layer.placement.height * canvas.height,
	};
	if (layer.kind === "text") {
		return {
			kind: "text",
			box,
			opacity: layer.opacity,
			text: layer.text,
			visual: projectTextLayerVisual(layer),
		};
	}
	if (layer.kind === "video") {
		// The export refuses a project with a video layer before painting anything.
		return null;
	}
	const asset = document.project.assets.find((candidate) => candidate.id === layer.assetId);
	const image = images.get(layer.assetId);
	if (!asset || asset.kind !== "image" || !image || box.width <= 0 || box.height <= 0) {
		return null;
	}
	const container = { x: 0, y: 0, width: box.width, height: box.height };
	const intrinsic = { width: asset.width, height: asset.height };
	const fit = fitMediaToBox({
		source: intrinsic,
		box: container,
		fit: layer.fit,
		focalPoint: layer.focalPoint,
	});
	return {
		kind: "image",
		box,
		opacity: layer.opacity,
		radius: layer.borderRadius ?? 0,
		image,
		media: projectFittedMediaRect({ intrinsic, fit, container }),
	};
}
