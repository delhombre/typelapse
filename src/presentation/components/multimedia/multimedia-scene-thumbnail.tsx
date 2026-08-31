import { fitSceneSurface } from "@/application/layout/fit-scene-surface";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { useMemo } from "react";
import { MultimediaSceneFrame, type SceneAssetSource } from "./multimedia-scene-frame";

const THUMBNAIL_VIEWPORT = { width: 166, height: 52 } as const;
const THUMBNAIL_FPS = 30;

function sceneStartMs(document: ProjectDocumentV2, sceneId: string): number {
	let cursorMs = 0;
	for (const scene of document.project.scenes) {
		if (scene.id === sceneId) return cursorMs;
		cursorMs += scene.durationMs + (scene.transitionOut?.durationMs ?? 0);
	}
	return 0;
}

export interface MultimediaSceneThumbnailProps {
	readonly document: ProjectDocumentV2;
	readonly sceneId: string;
	readonly resolveAsset: (assetId: string) => SceneAssetSource | null;
}

/** A real renderer frame, not a decorative placeholder, scaled into the timeline. */
export function MultimediaSceneThumbnail({
	document,
	sceneId,
	resolveAsset,
}: MultimediaSceneThumbnailProps) {
	const frame = useMemo(() => {
		const timeline = compileSceneTimeline({ document, fps: THUMBNAIL_FPS });
		const requestedFrame = Math.round((sceneStartMs(document, sceneId) / 1_000) * THUMBNAIL_FPS);
		return timeline.frameAt(requestedFrame);
	}, [document, sceneId]);
	const fit = fitSceneSurface(document.project.canvas, THUMBNAIL_VIEWPORT);

	return (
		<span className="mm-real-thumbnail" aria-hidden="true">
			<MultimediaSceneFrame
				document={document}
				frame={frame}
				resolveAsset={resolveAsset}
				style={{
					position: "absolute",
					transformOrigin: "0 0",
					transform: `translate3d(${fit.x}px, ${fit.y}px, 0) scale(${fit.scale})`,
				}}
			/>
		</span>
	);
}
