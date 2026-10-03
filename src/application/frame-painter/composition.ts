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
 * @param videoFrames This frame's decoded picture of each video layer, by block
 *   id: the source frame at the layer's `sourceTimeMs`, which is where the
 *   preview seeks its `<video>`. A video layer without one is left out.
 */
export function layeredFrameAt(
	document: ProjectDocumentV2,
	frame: SceneTimelineFrame,
	images: ReadonlyMap<string, PaintImage>,
	canvasWidth: number,
	videoFrames: ReadonlyMap<string, PaintImage> = new Map(),
): Omit<LayeredFrame, "scratch"> {
	const under: PaintLayer[] = [];
	const over: PaintLayer[] = [];
	for (const layer of frame.layers) {
		// The card is painted by the painter itself; any other code block is not
		// drawn by the preview either.
		if (layer.kind === "code") {
			continue;
		}
		const painted = paintLayerFor(document, layer, images, videoFrames);
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
	videoFrames: ReadonlyMap<string, PaintImage>,
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
	const asset = document.project.assets.find((candidate) => candidate.id === layer.assetId);
	// A video frame is drawn exactly as an image is: the same fit, focal point and
	// rounded clip the preview gives its `<video>` and its `<img>`.
	const image = layer.kind === "video" ? videoFrames.get(layer.blockId) : images.get(layer.assetId);
	if (!asset || asset.kind !== layer.kind || !image || box.width <= 0 || box.height <= 0) {
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
