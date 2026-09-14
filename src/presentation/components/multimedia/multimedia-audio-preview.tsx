import type { ResolvedAudioCue, SceneTimelineFrame } from "@/application/render/scene-timeline";
import { useEffect, useRef } from "react";
import type { SceneAssetSource } from "./multimedia-scene-frame";

interface ActiveAudioCueProps {
	readonly cue: ResolvedAudioCue;
	readonly source: SceneAssetSource;
	readonly playing: boolean;
}

function ActiveAudioCue({ cue, source, playing }: ActiveAudioCueProps) {
	const ref = useRef<HTMLAudioElement>(null);

	useEffect(() => {
		const audio = ref.current;
		if (!audio) return;
		const requestedSeconds = cue.sourceTimeMs / 1_000;
		const tolerance = playing ? 0.12 : 0.04;
		if (Math.abs(audio.currentTime - requestedSeconds) > tolerance) {
			audio.currentTime = requestedSeconds;
		}
		audio.volume = Math.min(Math.max(cue.gain, 0), 1);
	}, [cue.gain, cue.sourceTimeMs, playing]);

	useEffect(() => {
		const audio = ref.current;
		if (!audio) return;
		if (!playing) {
			if (!audio.paused) audio.pause();
			return;
		}
		void audio.play().catch(() => undefined);
	}, [playing]);

	useEffect(
		() => () => {
			const audio = ref.current;
			if (audio && !audio.paused) audio.pause();
		},
		[],
	);

	return (
		// biome-ignore lint/a11y/useMediaCaption: This hidden transport mirrors an authored audio cue; any transcription is a separate visual layer.
		<audio
			ref={ref}
			src={source.src}
			preload="auto"
			hidden
			data-audio-cue={cue.cueId}
			data-source-time-ms={cue.sourceTimeMs}
		/>
	);
}

export interface MultimediaAudioPreviewProps {
	readonly frame: SceneTimelineFrame;
	readonly playing: boolean;
	readonly resolveAsset: (assetId: string) => SceneAssetSource | null;
}

/** Keeps authored audio cues frame-synchronized with the user-driven preview. */
export function MultimediaAudioPreview({
	frame,
	playing,
	resolveAsset,
}: MultimediaAudioPreviewProps) {
	return frame.audio.map((cue) => {
		const source = resolveAsset(cue.assetId);
		if (!source || source.assetId !== cue.assetId || !source.src.trim()) return null;
		return <ActiveAudioCue key={cue.cueId} cue={cue} source={source} playing={playing} />;
	});
}
