import { fitMediaToBox, projectFittedMediaRect } from "@/application/layout/media-fit";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { type CompositionSlot, compositionSlot } from "@/application/render/composition-slots";
import { projectTextLayerVisual } from "@/application/render/scene-layer-visuals";
import type {
	ResolvedImageLayer,
	ResolvedSceneLayer,
	ResolvedVideoLayer,
	SceneTimelineFrame,
} from "@/application/render/scene-timeline";
import { MultimediaAudioPreview } from "@/presentation/components/multimedia/multimedia-audio-preview";
import { MultimediaTextLayerContent } from "@/presentation/components/multimedia/multimedia-layer-content";
import { studioMediaRegistry } from "@/presentation/studio-media-runtime";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";

export type StudioCompositionLayerSlot = CompositionSlot;

interface StudioCompositionLayersProps {
	readonly document: ProjectDocumentV2;
	readonly frame: SceneTimelineFrame;
	/** The rate `frame` was compiled at: a paused step is one frame of it. */
	readonly fps: number;
	readonly slot: StudioCompositionLayerSlot;
	readonly playing: boolean;
	readonly selectedBlockId: string | null;
	readonly onSelectLayer: (sceneId: string, blockId: string) => void;
}

function belongsToSlot(
	document: ProjectDocumentV2,
	layer: ResolvedSceneLayer,
	slot: StudioCompositionLayerSlot,
): boolean {
	if (layer.kind === "code") {
		return false;
	}
	if (!document.project.scenes.some((candidate) => candidate.id === layer.sceneId)) {
		return false;
	}
	// The painter splits the layers around the card by the same rule.
	return compositionSlot(document, layer) === slot;
}

function layerStyle(document: ProjectDocumentV2, layer: ResolvedSceneLayer): CSSProperties {
	return {
		position: "absolute",
		left: layer.placement.x * document.project.canvas.width,
		top: layer.placement.y * document.project.canvas.height,
		width: layer.placement.width * document.project.canvas.width,
		height: layer.placement.height * document.project.canvas.height,
		opacity: layer.opacity,
		minWidth: 0,
		minHeight: 0,
	};
}

function mediaRect(document: ProjectDocumentV2, layer: ResolvedImageLayer | ResolvedVideoLayer) {
	const asset = document.project.assets.find((candidate) => candidate.id === layer.assetId);
	if (!asset || asset.kind !== layer.kind) {
		return null;
	}
	const box = {
		x: 0,
		y: 0,
		width: layer.placement.width * document.project.canvas.width,
		height: layer.placement.height * document.project.canvas.height,
	};
	const fit = fitMediaToBox({
		source: { width: asset.width, height: asset.height },
		box,
		fit: layer.fit,
		focalPoint: layer.focalPoint,
	});
	return projectFittedMediaRect({
		intrinsic: { width: asset.width, height: asset.height },
		fit,
		container: box,
	});
}

function StudioImageLayer({
	document,
	layer,
}: {
	document: ProjectDocumentV2;
	layer: ResolvedImageLayer;
}) {
	const source = studioMediaRegistry.resolve(layer.assetId);
	const rect = mediaRect(document, layer);
	if (!source || !rect) {
		return <MissingMedia />;
	}
	return (
		<img
			src={source.src}
			alt=""
			draggable={false}
			style={{
				position: "absolute",
				display: "block",
				// The studio's preflight caps media at its box's width; a cover fit is
				// wider than its box by design, and the cap squashed it out of its clip.
				maxWidth: "none",
				maxHeight: "none",
				left: rect.x,
				top: rect.y,
				width: rect.width,
				height: rect.height,
			}}
		/>
	);
}

function StudioVideoLayer({
	document,
	layer,
	fps,
	playing,
}: {
	document: ProjectDocumentV2;
	layer: ResolvedVideoLayer;
	fps: number;
	playing: boolean;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const source = studioMediaRegistry.resolve(layer.assetId);
	const rect = mediaRect(document, layer);

	useEffect(() => {
		const video = ref.current;
		if (!video) {
			return;
		}
		video.playbackRate = layer.playbackRate;
	}, [layer.playbackRate]);
	useEffect(() => {
		const video = ref.current;
		if (!video || !Number.isFinite(layer.sourceTimeMs)) {
			return;
		}
		const requestedSeconds = layer.sourceTimeMs / 1_000;
		// Paused, half a frame: a fixed 0.04 s swallowed a one-frame step at 60 fps
		// (0.017 s) and showed the previous source frame where the export, which
		// decodes every frame exactly, shows the next one.
		const tolerance = playing ? 0.12 : 0.5 / fps;
		if (Math.abs(video.currentTime - requestedSeconds) > tolerance) {
			video.currentTime = requestedSeconds;
		}
	}, [layer.sourceTimeMs, playing, fps]);
	useEffect(() => {
		const video = ref.current;
		if (!video) {
			return;
		}
		if (!playing || layer.sourceEnded) {
			video.pause();
			return;
		}
		void video.play().catch(() => undefined);
	}, [layer.sourceEnded, playing]);

	if (!source || !rect) {
		return <MissingMedia />;
	}
	return (
		<video
			ref={ref}
			src={source.src}
			muted={layer.muted}
			playsInline
			preload="auto"
			style={{
				position: "absolute",
				display: "block",
				// The studio's preflight caps media at its box's width; a cover fit is
				// wider than its box by design, and the cap squashed it out of its clip.
				maxWidth: "none",
				maxHeight: "none",
				left: rect.x,
				top: rect.y,
				width: rect.width,
				height: rect.height,
			}}
		/>
	);
}

function MissingMedia() {
	return <div className="sc-composition-missing">Media unavailable</div>;
}

function layerContent(
	document: ProjectDocumentV2,
	layer: Exclude<ResolvedSceneLayer, { kind: "code" }>,
	fps: number,
	playing: boolean,
): ReactNode {
	if (layer.kind === "text") {
		return <MultimediaTextLayerContent text={layer.text} visual={projectTextLayerVisual(layer)} />;
	}
	if (layer.kind === "image") {
		return <StudioImageLayer document={document} layer={layer} />;
	}
	return <StudioVideoLayer document={document} layer={layer} fps={fps} playing={playing} />;
}

/** Native-canvas layer surface, scaled as a whole by the accepted preview. */
export function StudioCompositionLayers({
	document,
	frame,
	fps,
	slot,
	playing,
	selectedBlockId,
	onSelectLayer,
}: StudioCompositionLayersProps) {
	const layers = frame.layers.filter(
		(layer): layer is Exclude<ResolvedSceneLayer, { kind: "code" }> =>
			layer.kind !== "code" && belongsToSlot(document, layer, slot),
	);
	if (layers.length === 0) {
		return null;
	}
	return (
		<div
			className="sc-composition-layer-surface"
			data-slot={slot}
			style={{
				width: document.project.canvas.width,
				height: document.project.canvas.height,
			}}
		>
			{layers.map((layer) => {
				const selected = selectedBlockId === layer.blockId;
				return (
					<button
						type="button"
						key={`${layer.sceneId}:${layer.blockId}`}
						className="sc-composition-layer"
						data-kind={layer.kind}
						data-selected={selected ? "" : undefined}
						style={{
							...layerStyle(document, layer),
							borderRadius:
								layer.kind === "image" || layer.kind === "video" ? (layer.borderRadius ?? 0) : 0,
						}}
						aria-label={`Edit ${layer.kind} layer`}
						aria-pressed={selected}
						onClick={(event) => {
							event.stopPropagation();
							onSelectLayer(layer.sceneId, layer.blockId);
						}}
					>
						{layerContent(document, layer, fps, playing)}
					</button>
				);
			})}
		</div>
	);
}

export function StudioCompositionAudio({
	frame,
	playing,
}: {
	frame: SceneTimelineFrame;
	playing: boolean;
}) {
	return (
		<MultimediaAudioPreview
			frame={frame}
			playing={playing}
			resolveAsset={(assetId) => studioMediaRegistry.resolve(assetId)}
		/>
	);
}
