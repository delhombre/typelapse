import type { CSSProperties, ReactNode } from "react";
import {
	AbsoluteFill,
	Audio,
	Img,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import {
	isSafeBackground,
	resolveBackgroundCss,
} from "../../../src/application/backgrounds/mesh-gradient";
import {
	type MediaFitResult,
	type MediaRect,
	fitMediaToBox,
	projectFittedMediaRect,
} from "../../../src/application/layout/media-fit";
import type { BlockPlacementPayload } from "../../../src/application/project/project-document";
import {
	type ResolvedCodeLayer,
	type ResolvedSceneLayer,
	compileSceneTimeline,
} from "../../../src/application/render/scene-timeline";
import {
	type CodeLayerVisual,
	projectCodeLayerVisual,
	projectTextLayerVisual,
	type TextLayerVisual,
} from "../../../src/application/render/scene-layer-visuals";
import {
	MultimediaCodeLayerContent,
	MultimediaTextLayerContent,
} from "../../../src/presentation/components/multimedia/multimedia-layer-content";
import type { RemotionV2CompositionInput } from "./types";

interface PixelBox {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

interface CompositionLayerBase {
	readonly blockId: string;
	readonly opacity: number;
	readonly box: PixelBox;
	readonly borderRadius?: number;
}

export type V2CompositionLayer =
	| (CompositionLayerBase & {
			readonly kind: "text";
			readonly text: string;
			readonly visual: TextLayerVisual;
		})
	| (CompositionLayerBase & {
			readonly kind: "image";
			readonly source: string;
			readonly fit: MediaFitResult;
			readonly mediaRect: MediaRect;
		})
	| (CompositionLayerBase & {
			readonly kind: "video";
			readonly source: string;
			readonly fit: MediaFitResult;
			readonly mediaRect: MediaRect;
			readonly sourceTimeMs: number;
			readonly trimStartMs: number;
			readonly playbackRate: number;
			readonly sourceEnded: boolean;
			readonly muted: boolean;
		})
	| (CompositionLayerBase & {
			readonly kind: "code";
			readonly code: string;
			readonly language: string;
			readonly showLineNumbers: boolean;
			readonly lineNumberStart: number;
			readonly visual: CodeLayerVisual;
		});

export interface V2CompositionFrame {
	readonly background: string;
	readonly layers: readonly V2CompositionLayer[];
}

export interface V2CompositionAudioTrack {
	readonly cueId: string;
	readonly source: string;
	readonly fromFrame: number;
	readonly durationInFrames: number;
	readonly trimBeforeFrame: number;
	readonly trimAfterFrame: number;
	readonly gain: number;
	readonly fadeInFrames: number;
	readonly fadeOutFrames: number;
}

export interface V2RemotionCompositionPlan {
	readonly totalFrames: number;
	readonly durationMs: number;
	readonly audioTracks: readonly V2CompositionAudioTrack[];
	frameAt(frame: number): V2CompositionFrame;
}

function pixelBox(placement: BlockPlacementPayload, width: number, height: number): PixelBox {
	return {
		x: placement.x * width,
		y: placement.y * height,
		width: placement.width * width,
		height: placement.height * height,
	};
}

function safePublicPath(publicPath: string): string {
	if (
		!publicPath ||
		publicPath.startsWith("/") ||
		publicPath.includes("\\") ||
		publicPath.split("/").includes("..") ||
		/^[a-z][a-z0-9+.-]*:/i.test(publicPath)
	) {
		throw new Error("Remotion V2 asset source must be a safe bundle-relative path");
	}
	return publicPath;
}

function hostedBackground(background: string, timeSeconds: number): string {
	if (!isSafeBackground(background) || background.startsWith("image:")) {
		return "#111111";
	}
	return resolveBackgroundCss(background, timeSeconds);
}

function millisecondsToFrames(milliseconds: number, fps: number): number {
	return Math.round((milliseconds / 1_000) * fps);
}

function staticCodeLayer(layer: ResolvedCodeLayer, box: PixelBox): V2CompositionLayer {
	return {
		kind: "code",
		blockId: layer.blockId,
		opacity: layer.opacity,
		box,
		code: layer.code,
		language: layer.language,
		showLineNumbers: layer.showLineNumbers,
		lineNumberStart: layer.lineNumberStart,
		visual: projectCodeLayerVisual(layer),
	};
}

export function compileV2RemotionComposition(input: {
	readonly input: RemotionV2CompositionInput;
	readonly fps: number;
	readonly width: number;
	readonly height: number;
	readonly resolvePublicAsset: (publicPath: string) => string;
}): V2RemotionCompositionPlan {
	const timeline = compileSceneTimeline({ document: input.input.document, fps: input.fps });
	const assets = new Map(input.input.document.project.assets.map((asset) => [asset.id, asset]));
	const sources = new Map(
		input.input.assetSources.map((source) => [
			source.assetId,
			input.resolvePublicAsset(safePublicPath(source.publicPath)),
		]),
	);
	const audioTracks = input.input.includeAudio
		? input.input.document.project.audioCues.map((cue): V2CompositionAudioTrack => {
				const source = sources.get(cue.assetId);
				if (!source) {
					throw new Error(`Remotion V2 source is missing for asset '${cue.assetId}'`);
				}
				const trimBeforeFrame = millisecondsToFrames(cue.trim.startMs, input.fps);
				const trimAfterFrame = millisecondsToFrames(cue.trim.endMs, input.fps);
				return {
					cueId: cue.id,
					source,
					fromFrame: millisecondsToFrames(cue.startMs, input.fps),
					durationInFrames: Math.max(1, trimAfterFrame - trimBeforeFrame),
					trimBeforeFrame,
					trimAfterFrame,
					gain: cue.gain,
					fadeInFrames: millisecondsToFrames(cue.fadeInMs, input.fps),
					fadeOutFrames: millisecondsToFrames(cue.fadeOutMs, input.fps),
				};
			})
		: [];

	const mediaLayer = (
		layer: Extract<ResolvedSceneLayer, { kind: "image" | "video" }>,
		box: PixelBox,
	): V2CompositionLayer => {
		const asset = assets.get(layer.assetId);
		const source = sources.get(layer.assetId);
		if (!asset || asset.kind === "audio" || !source) {
			throw new Error(`Remotion V2 source is missing for asset '${layer.assetId}'`);
		}
		const fitted = fitMediaToBox({
			source: { width: asset.width, height: asset.height },
			box,
			fit: layer.fit,
			focalPoint: layer.focalPoint,
		});
		const mediaRect = projectFittedMediaRect({
			intrinsic: { width: asset.width, height: asset.height },
			fit: fitted,
			container: box,
		});
		if (layer.kind === "image") {
			return {
				kind: layer.kind,
				blockId: layer.blockId,
				opacity: layer.opacity,
				box,
				...(layer.borderRadius !== undefined ? { borderRadius: layer.borderRadius } : {}),
				source,
				fit: fitted,
				mediaRect,
			};
		}
		return {
			kind: layer.kind,
			blockId: layer.blockId,
			opacity: layer.opacity,
			box,
			...(layer.borderRadius !== undefined ? { borderRadius: layer.borderRadius } : {}),
			source,
			fit: fitted,
			mediaRect,
			sourceTimeMs: layer.sourceTimeMs,
			trimStartMs: layer.trimStartMs,
			playbackRate: layer.playbackRate,
			sourceEnded: layer.sourceEnded,
			muted: layer.muted || !input.input.includeAudio,
		};
	};

	return {
		totalFrames: timeline.totalFrames,
		durationMs: timeline.durationMs,
		audioTracks,
		frameAt(frame) {
			const resolved = timeline.frameAt(frame);
			const layers = resolved.layers.map((layer): V2CompositionLayer => {
				const box = pixelBox(layer.placement, input.width, input.height);
				switch (layer.kind) {
					case "text":
						return {
							kind: layer.kind,
							blockId: layer.blockId,
							opacity: layer.opacity,
							box,
							text: layer.text,
							visual: projectTextLayerVisual(layer),
						};
					case "image":
					case "video":
						return mediaLayer(layer, box);
					case "code":
						return staticCodeLayer(layer, box);
				}
			});
			return {
				background: hostedBackground(
					input.input.document.project.canvas.background,
					resolved.timeMs / 1_000,
				),
				layers,
			};
		},
	};
}

function positionedStyle(box: PixelBox, opacity: number): CSSProperties {
	return {
		position: "absolute",
		left: box.x,
		top: box.y,
		width: box.width,
		height: box.height,
		opacity,
	};
}

function fittedMediaStyle(
	layer: Extract<V2CompositionLayer, { kind: "image" | "video" }>,
): CSSProperties {
	return {
		position: "absolute",
		left: layer.mediaRect.x,
		top: layer.mediaRect.y,
		width: layer.mediaRect.width,
		height: layer.mediaRect.height,
	};
}

export interface RemotionVideoTiming {
	readonly sourceFrame: number;
	readonly sequenceFromFrame: number;
}

/**
 * Anchor the Remotion child timeline to the exact source timestamp projected
 * by the canonical scene timeline. This preserves trims and arbitrary playback
 * rates without relying on a drifting media clock.
 */
export function projectRemotionVideoTiming({
	frame,
	fps,
	sourceTimeMs,
}: {
	readonly frame: number;
	readonly fps: number;
	readonly sourceTimeMs: number;
}): RemotionVideoTiming {
	if (!Number.isSafeInteger(frame) || frame < 0) {
		throw new Error("Remotion frame must be a non-negative integer");
	}
	if (!Number.isSafeInteger(fps) || fps <= 0) {
		throw new Error("Remotion fps must be a positive integer");
	}
	if (!Number.isFinite(sourceTimeMs) || sourceTimeMs < 0) {
		throw new Error("Remotion video source time must be non-negative");
	}
	const sourceFrame = Math.round((sourceTimeMs / 1_000) * fps);
	return {
		sourceFrame,
		sequenceFromFrame: frame - sourceFrame,
	};
}

function visualLayer(
	layer: V2CompositionLayer,
	frame: number,
	fps: number,
	projectTitle: string,
): ReactNode {
	switch (layer.kind) {
		case "text":
			return (
				<div key={layer.blockId} style={positionedStyle(layer.box, layer.opacity)}>
					<MultimediaTextLayerContent text={layer.text} visual={layer.visual} />
				</div>
			);
		case "image":
			return (
				<div
					key={layer.blockId}
					style={{
						...positionedStyle(layer.box, layer.opacity),
						overflow: "hidden",
						borderRadius: layer.borderRadius ?? 0,
					}}
				>
					<Img src={layer.source} style={fittedMediaStyle(layer)} />
				</div>
			);
		case "video": {
			const timing = projectRemotionVideoTiming({
				frame,
				fps,
				sourceTimeMs: layer.sourceTimeMs,
			});
			return (
				<div
					key={layer.blockId}
					style={{
						...positionedStyle(layer.box, layer.opacity),
						overflow: "hidden",
						borderRadius: layer.borderRadius ?? 0,
					}}
				>
					<Sequence from={timing.sequenceFromFrame} layout="none">
						<OffthreadVideo
							src={layer.source}
							muted={layer.muted}
							style={fittedMediaStyle(layer)}
						/>
					</Sequence>
				</div>
			);
		}
		case "code":
			return (
				<div key={layer.blockId} style={positionedStyle(layer.box, layer.opacity)}>
					<MultimediaCodeLayerContent
						blockId={layer.blockId}
						code={layer.code}
						language={layer.language}
						showLineNumbers={layer.showLineNumbers}
						lineNumberStart={layer.lineNumberStart}
						projectTitle={projectTitle}
						visual={layer.visual}
					/>
				</div>
			);
	}
}

function audioVolume(track: V2CompositionAudioTrack): (relativeFrame: number) => number {
	return (relativeFrame) => {
		const fadeIn = track.fadeInFrames > 0 ? Math.min(relativeFrame / track.fadeInFrames, 1) : 1;
		const remainingFrames = track.durationInFrames - relativeFrame;
		const fadeOut =
			track.fadeOutFrames > 0 ? Math.min(remainingFrames / track.fadeOutFrames, 1) : 1;
		return track.gain * Math.max(0, Math.min(fadeIn, fadeOut, 1));
	};
}

export function V2RemotionComposition({ input }: { readonly input: RemotionV2CompositionInput }) {
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();
	const composition = compileV2RemotionComposition({
		input,
		fps,
		width,
		height,
		resolvePublicAsset: staticFile,
	});
	const resolved = composition.frameAt(frame);
	return (
		<AbsoluteFill style={{ background: resolved.background }}>
			{resolved.layers.map((layer) =>
				visualLayer(layer, frame, fps, input.document.project.title),
			)}
			{composition.audioTracks.map((track) => (
				<Sequence
					key={track.cueId}
					from={track.fromFrame}
					durationInFrames={track.durationInFrames}
					layout="none"
				>
					<Audio
						src={track.source}
						trimBefore={track.trimBeforeFrame}
						trimAfter={track.trimAfterFrame}
						volume={audioVolume(track)}
					/>
				</Sequence>
			))}
		</AbsoluteFill>
	);
}
