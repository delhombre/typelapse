import { useLayoutEffect, useRef, useState } from "react";
import { fitSceneSurface } from "../../../application/layout/fit-scene-surface";
import type { ProjectDocumentV2 } from "../../../application/project/project-document";
import type { SceneTimelineFrame } from "../../../application/render/scene-timeline";
import { MultimediaAudioPreview } from "./multimedia-audio-preview";
import { MultimediaSceneFrame, type SceneAssetSource } from "./multimedia-scene-frame";

export interface MultimediaStageProps {
	readonly document: ProjectDocumentV2;
	readonly frame: SceneTimelineFrame;
	readonly resolveAsset: (assetId: string) => SceneAssetSource | null;
	readonly playing?: boolean;
	readonly selectedBlockId?: string | null;
	readonly onSelectLayer?: (sceneId: string, blockId: string) => void;
	readonly onClearSelection?: () => void;
}

interface ViewportSize {
	readonly width: number;
	readonly height: number;
}

function viewportSize(node: HTMLElement): ViewportSize | null {
	const bounds = node.getBoundingClientRect();
	if (bounds.width <= 0 || bounds.height <= 0) {
		return null;
	}
	return { width: bounds.width, height: bounds.height };
}

/** Fits the native authored canvas into the available stage without reframing it. */
export function MultimediaStage({
	document,
	frame,
	resolveAsset,
	playing = false,
	selectedBlockId = null,
	onSelectLayer,
	onClearSelection,
}: MultimediaStageProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [viewport, setViewport] = useState<ViewportSize | null>(null);

	useLayoutEffect(() => {
		const node = viewportRef.current;
		if (!node) {
			return;
		}
		const measure = () => setViewport(viewportSize(node));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const fit = viewport
		? fitSceneSurface(document.project.canvas, viewport)
		: { x: 0, y: 0, scale: 1, width: 0, height: 0 };

	return (
		<div ref={viewportRef} className="mm-stage-viewport" data-ready={viewport ? "" : undefined}>
			<MultimediaAudioPreview frame={frame} playing={playing} resolveAsset={resolveAsset} />
			{onClearSelection ? (
				<button
					type="button"
					className="mm-stage-clear"
					aria-label="Clear layer selection"
					onClick={onClearSelection}
				/>
			) : null}
			<div
				className="mm-stage-surface"
				style={{
					width: document.project.canvas.width,
					height: document.project.canvas.height,
					transform: `translate3d(${fit.x}px, ${fit.y}px, 0) scale(${fit.scale})`,
					visibility: viewport ? "visible" : "hidden",
				}}
			>
				<MultimediaSceneFrame
					document={document}
					frame={frame}
					resolveAsset={resolveAsset}
					playing={playing}
					selectedBlockId={selectedBlockId}
					onSelectLayer={onSelectLayer}
				/>
			</div>
		</div>
	);
}
