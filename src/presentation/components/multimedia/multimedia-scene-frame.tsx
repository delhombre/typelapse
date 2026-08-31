import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { resolveBackgroundCss } from "../../../application/backgrounds/mesh-gradient";
import {
	type MediaRect,
	fitMediaToBox,
	projectFittedMediaRect,
} from "../../../application/layout/media-fit";
import type { ProjectDocumentV2 } from "../../../application/project/project-document";
import {
	type CodeLayerVisual,
	projectCodeLayerVisual,
	projectTextLayerVisual,
} from "../../../application/render/scene-layer-visuals";
import type {
	ResolvedCodeLayer,
	ResolvedImageLayer,
	ResolvedSceneLayer,
	ResolvedTextLayer,
	ResolvedVideoLayer,
	SceneTimelineFrame,
} from "../../../application/render/scene-timeline";
import { MultimediaCodeLayerContent, MultimediaTextLayerContent } from "./multimedia-layer-content";

export interface SceneAssetSource {
	readonly assetId: string;
	/** Ephemeral browser/object/storage URL. It is never part of the project document. */
	readonly src: string;
}

export interface SceneCodeRenderInput {
	readonly layer: ResolvedCodeLayer;
	readonly projectTitle: string;
	readonly visual: CodeLayerVisual;
}

export interface SceneImageRenderInput {
	readonly layer: ResolvedImageLayer;
	readonly source: SceneAssetSource;
	readonly mediaRect: MediaRect;
}

export interface SceneVideoRenderInput {
	readonly layer: ResolvedVideoLayer;
	readonly source: SceneAssetSource;
	readonly playing: boolean;
	readonly mediaRect: MediaRect;
}

interface MultimediaSceneFrameProps {
	readonly document: ProjectDocumentV2;
	readonly frame: SceneTimelineFrame;
	readonly resolveAsset: (assetId: string) => SceneAssetSource | null;
	readonly renderCode?: (input: SceneCodeRenderInput) => ReactNode;
	readonly renderImage?: (input: SceneImageRenderInput) => ReactNode;
	readonly renderVideo?: (input: SceneVideoRenderInput) => ReactNode;
	readonly playing?: boolean;
	readonly selectedBlockId?: string | null;
	readonly onSelectLayer?: (sceneId: string, blockId: string) => void;
	readonly className?: string;
	readonly style?: CSSProperties;
}

function layerStyle(layer: ResolvedSceneLayer): CSSProperties {
	return {
		position: "absolute",
		left: `${layer.placement.x * 100}%`,
		top: `${layer.placement.y * 100}%`,
		width: `${layer.placement.width * 100}%`,
		height: `${layer.placement.height * 100}%`,
		opacity: layer.opacity,
		minWidth: 0,
		minHeight: 0,
	};
}

function MissingAsset({ assetId }: { readonly assetId: string }) {
	return (
		<div
			data-missing-asset={assetId}
			style={{
				display: "grid",
				width: "100%",
				height: "100%",
				placeItems: "center",
				background: "rgb(127 127 127 / 0.1)",
				border: "1px solid rgb(127 127 127 / 0.16)",
				color: "rgb(127 127 127 / 0.85)",
				fontFamily: "ui-sans-serif, system-ui, sans-serif",
				fontSize: 18,
			}}
		>
			Media unavailable
		</div>
	);
}

function DefaultImage({ layer, source, mediaRect }: SceneImageRenderInput) {
	return (
		<img
			src={source.src}
			alt=""
			draggable={false}
			data-media-fit={layer.fit}
			style={{
				position: "absolute",
				display: "block",
				left: mediaRect.x,
				top: mediaRect.y,
				width: mediaRect.width,
				height: mediaRect.height,
			}}
		/>
	);
}

function DefaultVideo({ layer, source, playing, mediaRect }: SceneVideoRenderInput) {
	const ref = useRef<HTMLVideoElement>(null);
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
		const tolerance = playing ? 0.12 : 0.04;
		if (Math.abs(video.currentTime - requestedSeconds) > tolerance) {
			video.currentTime = requestedSeconds;
		}
	}, [layer.sourceTimeMs, playing]);
	useEffect(() => {
		const video = ref.current;
		if (!video) return;
		if (!playing || layer.sourceEnded) {
			if (!video.paused) video.pause();
			return;
		}
		void video.play().catch(() => undefined);
	}, [layer.sourceEnded, playing]);
	useEffect(
		() => () => {
			const video = ref.current;
			if (video && !video.paused) video.pause();
		},
		[],
	);

	return (
		<video
			ref={ref}
			src={source.src}
			muted={layer.muted}
			playsInline
			preload="auto"
			data-media-fit={layer.fit}
			data-source-time-ms={layer.sourceTimeMs}
			style={{
				position: "absolute",
				display: "block",
				left: mediaRect.x,
				top: mediaRect.y,
				width: mediaRect.width,
				height: mediaRect.height,
			}}
		/>
	);
}

function DefaultText({ layer }: { readonly layer: ResolvedTextLayer }) {
	return <MultimediaTextLayerContent text={layer.text} visual={projectTextLayerVisual(layer)} />;
}

function DefaultCode({ layer, projectTitle, visual }: SceneCodeRenderInput) {
	return (
		<MultimediaCodeLayerContent
			blockId={layer.blockId}
			code={layer.code}
			language={layer.language}
			showLineNumbers={layer.showLineNumbers}
			lineNumberStart={layer.lineNumberStart}
			projectTitle={projectTitle}
			visual={visual}
		/>
	);
}

function mediaRectForLayer(
	document: ProjectDocumentV2,
	layer: ResolvedImageLayer | ResolvedVideoLayer,
): MediaRect | null {
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

function resolvedSource(
	assetId: string,
	resolveAsset: MultimediaSceneFrameProps["resolveAsset"],
): SceneAssetSource | null {
	const source = resolveAsset(assetId);
	if (!source || source.assetId !== assetId || !source.src.trim()) {
		return null;
	}
	return source;
}

/**
 * Renderer-neutral scene structure. It owns canvas geometry, z-order and
 * opacity; browser and Remotion adapters only provide the media primitives.
 */
export function MultimediaSceneFrame({
	document,
	frame,
	resolveAsset,
	renderCode = DefaultCode,
	renderImage = DefaultImage,
	renderVideo = DefaultVideo,
	playing = false,
	selectedBlockId = null,
	onSelectLayer,
	className,
	style,
}: MultimediaSceneFrameProps) {
	const { project } = document;
	return (
		<div
			className={className}
			data-multimedia-scene-frame=""
			data-project-id={project.id}
			data-frame={frame.frame}
			style={{
				position: "relative",
				isolation: "isolate",
				width: project.canvas.width,
				height: project.canvas.height,
				overflow: "hidden",
				background: resolveBackgroundCss(project.canvas.background, frame.timeMs / 1_000),
				...style,
			}}
		>
			{frame.layers.map((layer) => {
				const selected = layer.blockId === selectedBlockId;
				let content: ReactNode;
				if (layer.kind === "text") {
					content = <DefaultText layer={layer} />;
				} else if (layer.kind === "code") {
					content = renderCode({
						layer,
						projectTitle: project.title,
						visual: projectCodeLayerVisual(layer),
					});
				} else {
					const source = resolvedSource(layer.assetId, resolveAsset);
					const mediaRect = mediaRectForLayer(document, layer);
					if (!source || !mediaRect) {
						content = <MissingAsset assetId={layer.assetId} />;
					} else if (layer.kind === "image") {
						content = renderImage({ layer, source, mediaRect });
					} else {
						content = renderVideo({ layer, source, playing, mediaRect });
					}
				}
				return (
					<div
						key={`${layer.sceneId}:${layer.blockId}`}
						role={onSelectLayer ? "button" : undefined}
						tabIndex={onSelectLayer ? 0 : undefined}
						aria-label={onSelectLayer ? `Select ${layer.kind} layer` : undefined}
						aria-pressed={onSelectLayer ? selected : undefined}
						data-scene-layer={layer.kind}
						data-scene-id={layer.sceneId}
						data-block-id={layer.blockId}
						data-selected={selected ? "" : undefined}
						style={{
							...layerStyle(layer),
							...(layer.kind === "image" || layer.kind === "video"
								? {
										overflow: "hidden",
										borderRadius: layer.borderRadius ?? 0,
									}
								: {}),
							...(onSelectLayer ? { cursor: "pointer" } : {}),
							...(selected ? { outline: "3px solid #3182f6", outlineOffset: "-3px" } : {}),
						}}
						onClick={
							onSelectLayer
								? (event) => {
										event.stopPropagation();
										onSelectLayer(layer.sceneId, layer.blockId);
									}
								: undefined
						}
						onKeyDown={
							onSelectLayer
								? (event) => {
										if (event.key !== "Enter" && event.key !== " ") {
											return;
										}
										event.preventDefault();
										onSelectLayer(layer.sceneId, layer.blockId);
									}
								: undefined
						}
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}
