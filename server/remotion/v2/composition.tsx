import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import {
	AbsoluteFill,
	Audio,
	Img,
	OffthreadVideo,
	Sequence,
	continueRender,
	delayRender,
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
import { fontsToLoad, googleFontCssUrl } from "../../../src/application/fonts/code-fonts";
import { BASE_VIDEO_SCALE, renderScaleFor } from "../../../src/application/layout/canvas-fit";
import type {
	BlockPlacementPayload,
	ProjectDocumentV2,
} from "../../../src/application/project/project-document";
import {
	type CompositionSlot,
	compositionSlot,
	primaryCodeOpacity,
} from "../../../src/application/render/composition-slots";
import {
	projectTextLayerVisual,
	type TextLayerVisual,
} from "../../../src/application/render/scene-layer-visuals";
import {
	type ResolvedSceneLayer,
	compileSceneTimeline,
} from "../../../src/application/render/scene-timeline";
import { MultimediaTextLayerContent } from "../../../src/presentation/components/multimedia/multimedia-layer-content";
import { GlowDecoration } from "../../../src/presentation/components/preview/glow-decoration";
import { GrainOverlay } from "../../../src/presentation/components/preview/grain-overlay";
import { getWatermarkColor } from "../../../src/presentation/utils/watermark-color";
import { CodeCard, WatermarkOverlay } from "../composition";
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
	/** In project canvas pixels: the surface is scaled to the output as one, as in the preview. */
	readonly box: PixelBox;
	/** The side of the code card it is painted on (`compositionSlot`). */
	readonly slot: CompositionSlot;
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
		});

export interface V2CompositionFrame {
	readonly background: string;
	/** Every layer but code, in paint order; the card sits between the two slots. */
	readonly layers: readonly V2CompositionLayer[];
	/** How visible the card is, the number the painter and the preview fade it by. */
	readonly codeOpacity: number;
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
	/** Output px per project canvas px, the painter's `surfaceScale`. */
	readonly surfaceScale: number;
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

export function compileV2RemotionComposition(input: {
	readonly input: RemotionV2CompositionInput;
	readonly fps: number;
	readonly width: number;
	readonly height: number;
	readonly resolvePublicAsset: (publicPath: string) => string;
}): V2RemotionCompositionPlan {
	const timeline = compileSceneTimeline({
		document: input.input.document,
		fps: input.fps,
		loop: input.input.loop === true,
	});
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
		slot: CompositionSlot,
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
				slot,
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
			slot,
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

	const { canvas } = input.input.document.project;
	return {
		totalFrames: timeline.totalFrames,
		durationMs: timeline.durationMs,
		audioTracks,
		surfaceScale: input.width / canvas.width,
		frameAt(frame) {
			const resolved = timeline.frameAt(frame);
			const layers: V2CompositionLayer[] = [];
			for (const layer of resolved.layers) {
				// The card is the studio's, drawn by `CodeCard`; no renderer draws a code
				// block from its own placement.
				if (layer.kind === "code") {
					continue;
				}
				const box = pixelBox(layer.placement, canvas.width, canvas.height);
				const slot = compositionSlot(input.input.document, layer);
				layers.push(
					layer.kind === "text"
						? {
								kind: layer.kind,
								blockId: layer.blockId,
								opacity: layer.opacity,
								box,
								slot,
								text: layer.text,
								visual: projectTextLayerVisual(layer),
							}
						: mediaLayer(layer, box, slot),
				);
			}
			return {
				background: hostedBackground(canvas.background, resolved.timeMs / 1_000),
				layers,
				codeOpacity: primaryCodeOpacity(resolved),
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

function visualLayer(layer: V2CompositionLayer, frame: number, fps: number): ReactNode {
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

/**
 * Hold the frame until every text layer's face has loaded, as `useFontLoaded`
 * holds it for the card's mono: the stylesheets the preview links (the shared
 * registry's URLs, Geist at index.html's weights), then each layer's own
 * weight, size and characters, since a face nothing has asked for is not
 * loading and `ready` alone would let the frame paint the fallback.
 */
function useTextFontsLoaded(document: ProjectDocumentV2): void {
	const faces = useMemo(() => {
		const found = new Map<string, { font: string; text: string; stack: string }>();
		for (const scene of document.project.scenes) {
			for (const block of scene.blocks) {
				if (block.kind !== "text") {
					continue;
				}
				const { fontFamily, fontSize, fontWeight } = block.typography;
				const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
				const text = `${found.get(font)?.text ?? ""}${block.text}`;
				found.set(font, { font, text, stack: fontFamily });
			}
		}
		return [...found.values()];
	}, [document]);
	const [handle] = useState(() =>
		faces.length > 0 ? delayRender("Loading text layer fonts") : null,
	);

	useEffect(() => {
		if (handle === null) {
			return;
		}
		const urls = fontsToLoad(...faces.map((face) => face.stack)).flatMap((font) =>
			font.google ? [googleFontCssUrl(font.google, font.weights)] : [],
		);
		Promise.all(urls.map((url) => fetch(url).then((response) => response.text())))
			.then((sheets) => {
				for (const css of sheets) {
					const style = window.document.createElement("style");
					style.textContent = css;
					window.document.head.appendChild(style);
				}
				return Promise.all(faces.map((face) => window.document.fonts.load(face.font, face.text)));
			})
			.then(() => window.document.fonts.ready)
			.catch((error) => {
				// The fallback is what the layers will be set in; the frame still renders.
				console.error("Text layer font loading failed:", error);
			})
			.finally(() => continueRender(handle));
	}, [handle, faces]);
}

/** One slot's layers on a surface the size of the project canvas, scaled to the output as one. */
function LayerSurface({
	layers,
	canvas,
	surfaceScale,
	frame,
	fps,
}: {
	readonly layers: readonly V2CompositionLayer[];
	readonly canvas: { readonly width: number; readonly height: number };
	readonly surfaceScale: number;
	readonly frame: number;
	readonly fps: number;
}) {
	if (layers.length === 0) {
		return null;
	}
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				top: 0,
				width: canvas.width,
				height: canvas.height,
				transform: `scale(${surfaceScale})`,
				transformOrigin: "0 0",
			}}
		>
			{layers.map((layer) => visualLayer(layer, frame, fps))}
		</div>
	);
}

export function V2RemotionComposition({ input }: { readonly input: RemotionV2CompositionInput }) {
	useTextFontsLoaded(input.document);
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();
	const composition = useMemo(
		() =>
			compileV2RemotionComposition({
				input,
				fps,
				width,
				height,
				resolvePublicAsset: staticFile,
			}),
		[input, fps, width, height],
	);
	const resolved = composition.frameAt(frame);
	const { canvas, settings } = input.document.project;
	const isTransparent = canvas.background === "transparent";
	const surface = { canvas, surfaceScale: composition.surfaceScale, frame, fps };
	const card = input.card;
	// The mark is the code-only composition's, set in the card's font; a project
	// with no card falls back to the studio's default theme for it.
	const markTheme = card?.theme ?? {
		foreground: "#e6edf3",
		fontFamily: "JetBrains Mono, monospace",
	};
	return (
		<AbsoluteFill style={{ background: resolved.background }}>
			{!isTransparent && <GlowDecoration />}
			{!isTransparent && <GrainOverlay />}
			<LayerSurface
				{...surface}
				layers={resolved.layers.filter((layer) => layer.slot === "under-code")}
			/>
			{card && (
				// CSS fades the card as one picture, as the painter composites it once.
				<AbsoluteFill style={{ opacity: resolved.codeOpacity }}>
					<CodeCard input={card} />
				</AbsoluteFill>
			)}
			<LayerSurface
				{...surface}
				layers={resolved.layers.filter((layer) => layer.slot === "over-code")}
			/>
			{settings.watermark && (
				<WatermarkOverlay
					text={settings.watermark}
					color={getWatermarkColor(canvas.background, markTheme.foreground)}
					fontFamily={markTheme.fontFamily}
					scale={renderScaleFor(width, height, BASE_VIDEO_SCALE)}
				/>
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
