import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDocumentV2 } from "../../application/project/project-document";
import { compileSceneTimeline } from "../../application/render/scene-timeline";

export interface MultimediaPlayback {
	readonly timeline: ReturnType<typeof compileSceneTimeline>;
	readonly currentFrame: number;
	readonly playing: boolean;
	play(): void;
	pause(): void;
	toggle(): void;
	seekFrame(frame: number): void;
	seekProgress(progress: number): void;
}

/** User-driven playback; nothing animates merely because the studio mounted. */
export function useMultimediaPlayback(
	document: ProjectDocumentV2,
	options: { readonly fps?: number; readonly loop?: boolean } = {},
): MultimediaPlayback {
	const fps = options.fps ?? 30;
	const loop = options.loop ?? false;
	const timeline = useMemo(() => compileSceneTimeline({ document, fps }), [document, fps]);
	const [currentFrame, setCurrentFrame] = useState(0);
	const [playing, setPlaying] = useState(false);
	const frameRef = useRef(0);

	const seekFrame = useCallback(
		(requested: number) => {
			const frame = Math.min(Math.max(Math.floor(requested), 0), timeline.totalFrames - 1);
			frameRef.current = frame;
			setCurrentFrame(frame);
		},
		[timeline.totalFrames],
	);

	useEffect(() => {
		seekFrame(frameRef.current);
	}, [seekFrame]);

	useEffect(() => {
		if (!playing) {
			return;
		}
		let animationFrame = 0;
		let startedAt = performance.now() - (frameRef.current / fps) * 1_000;
		const tick = (now: number) => {
			const elapsedFrames = Math.floor(((now - startedAt) / 1_000) * fps);
			if (elapsedFrames >= timeline.totalFrames) {
				if (loop) {
					frameRef.current = 0;
					setCurrentFrame(0);
					startedAt = now;
					animationFrame = requestAnimationFrame(tick);
					return;
				}
				seekFrame(timeline.totalFrames - 1);
				setPlaying(false);
				return;
			}
			if (elapsedFrames !== frameRef.current) {
				frameRef.current = elapsedFrames;
				setCurrentFrame(elapsedFrames);
			}
			animationFrame = requestAnimationFrame(tick);
		};
		animationFrame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animationFrame);
	}, [fps, loop, playing, seekFrame, timeline.totalFrames]);

	const play = useCallback(() => {
		if (frameRef.current >= timeline.totalFrames - 1) {
			seekFrame(0);
		}
		setPlaying(true);
	}, [seekFrame, timeline.totalFrames]);
	const pause = useCallback(() => setPlaying(false), []);
	const toggle = useCallback(() => {
		if (playing) {
			pause();
			return;
		}
		play();
	}, [pause, play, playing]);
	const seekProgress = useCallback(
		(progress: number) => {
			const clamped = Math.min(Math.max(progress, 0), 1);
			seekFrame(clamped * (timeline.totalFrames - 1));
		},
		[seekFrame, timeline.totalFrames],
	);

	return { timeline, currentFrame, playing, play, pause, toggle, seekFrame, seekProgress };
}
