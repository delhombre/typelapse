import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { SceneTimelineFrame } from "@/application/render/scene-timeline";
import {
	MultimediaSceneFrame,
	type SceneVideoRenderInput,
} from "@/presentation/components/multimedia/multimedia-scene-frame";
import { useInViewPlayback } from "@/presentation/hooks/use-in-view-playback";
import { useMultimediaPlayback } from "@/presentation/hooks/use-multimedia-playback";
import { useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { Pause, Play } from "reicon-react";
import "./multimedia-showcase.css";

const FPS = 30;
const CHECKSUMS = {
	image: "18d812c921a706524435c6f0464c7128239865b218d2a12d18e6570d37b65bcd",
	video: "29e923d032b817635546d7f1575d8239340976c329e3b23e29f7681e48c76cde",
	audio: "3af034e143c928746657e8f2686e9340451087d43af4c34f3a08792f59d87def",
} as const;

const IMAGE_SOURCE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#162e50"/><stop offset=".46" stop-color="#7a3d65"/><stop offset="1" stop-color="#f1995a"/>
    </linearGradient>
    <radialGradient id="sun"><stop stop-color="#ffeab5"/><stop offset="1" stop-color="#ffb45b" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="960" height="540" fill="url(#sky)"/>
  <circle cx="702" cy="158" r="188" fill="url(#sun)" opacity=".82"/>
  <path d="M0 420C155 332 282 358 410 413s290 53 550-58v185H0Z" fill="#111729" opacity=".55"/>
  <path d="M0 454c228-78 394-17 566 18 131 27 250 12 394-42v110H0Z" fill="#0c1425" opacity=".74"/>
</svg>`)}`;

export const LANDING_MULTIMEDIA_DOCUMENT: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "landing-story",
		title: "Field notes",
		canvas: { width: 960, height: 540, background: "#111729" },
		settings: {
			progressStyle: "none",
			transitionMs: 650,
			typewriter: false,
			focusZoom: false,
		},
		assets: [
			{
				id: "landing-image",
				kind: "image",
				fileName: "sunset.jpg",
				mimeType: "image/jpeg",
				byteSize: 824_000,
				checksum: CHECKSUMS.image,
				width: 2400,
				height: 1350,
			},
			{
				id: "landing-video",
				kind: "video",
				fileName: "orbit.mp4",
				mimeType: "video/mp4",
				byteSize: 3_740_000,
				checksum: CHECKSUMS.video,
				width: 1920,
				height: 1080,
				durationMs: 8_000,
			},
			{
				id: "landing-audio",
				kind: "audio",
				fileName: "soft-pulse.wav",
				mimeType: "audio/wav",
				byteSize: 1_260_000,
				checksum: CHECKSUMS.audio,
				durationMs: 7_500,
			},
		],
		audioCues: [
			{
				id: "landing-soundtrack",
				assetId: "landing-audio",
				startMs: 0,
				trim: { startMs: 0, endMs: 7_500 },
				gain: 0.72,
				fadeInMs: 180,
				fadeOutMs: 420,
			},
		],
		scenes: [
			{
				id: "landing-scene-title",
				durationMs: 2_050,
				transitionOut: { kind: "crossfade", durationMs: 450 },
				blocks: [
					{
						id: "landing-title-image",
						kind: "image",
						assetId: "landing-image",
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
						fit: "cover",
						focalPoint: { x: 0.5, y: 0.5 },
					},
					{
						id: "landing-title-text",
						kind: "text",
						opacity: 1,
						placement: { x: 0.08, y: 0.42, width: 0.84, height: 0.46 },
						text: "Every frame\ncan say something.",
						typography: {
							fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
							fontSize: 52,
							fontWeight: 650,
							color: "#fffaf0",
							align: "left",
						},
					},
				],
			},
			{
				id: "landing-scene-video",
				durationMs: 2_050,
				transitionOut: { kind: "magic-move", durationMs: 450 },
				blocks: [
					{
						id: "landing-video-layer",
						kind: "video",
						assetId: "landing-video",
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
						fit: "cover",
						focalPoint: { x: 0.5, y: 0.5 },
						trim: { startMs: 500, endMs: 3_400 },
						playbackRate: 1,
						muted: true,
					},
					{
						id: "landing-video-text",
						kind: "text",
						opacity: 1,
						placement: { x: 0.1, y: 0.12, width: 0.68, height: 0.34 },
						text: "A film,\ncut to the beat.",
						typography: {
							fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
							fontSize: 48,
							fontWeight: 650,
							color: "#fffdf8",
							align: "left",
						},
					},
				],
			},
			{
				id: "landing-scene-code",
				durationMs: 2_500,
				blocks: [
					{
						id: "landing-code-backdrop",
						kind: "image",
						assetId: "landing-image",
						opacity: 0.62,
						placement: { x: 0, y: 0, width: 1, height: 1 },
						fit: "cover",
						focalPoint: { x: 0.64, y: 0.45 },
					},
					{
						id: "landing-code-layer",
						kind: "code",
						opacity: 1,
						placement: { x: 0.12, y: 0.16, width: 0.76, height: 0.68 },
						code: "const story = {\n  media: [image, video, sound]\n}\nanimate(story)",
						language: "typescript",
						themeName: "midnight",
						chrome: "macos",
						showLineNumbers: true,
						lineNumberStart: 1,
						framePadding: 28,
						cardMargin: 32,
						borderRadius: 16,
					},
				],
			},
		],
	},
};

const SCENES = [
	{ id: "landing-scene-title", label: "Title card", kind: "Image + Text", startMs: 0 },
	{ id: "landing-scene-video", label: "Video beat", kind: "Video + Text", startMs: 2_500 },
	{ id: "landing-scene-code", label: "Code reveal", kind: "Code + Image", startMs: 5_000 },
] as const;

const MEDIA = ["Text", "Code", "Image", "Video", "Audio"] as const;
const WAVE_BARS = Array.from({ length: 32 }, (_, index) => ({
	id: `wave-${index + 1}`,
	height: 28 + ((index * 17) % 58),
}));

function activeSceneId(frame: SceneTimelineFrame): string {
	return (
		[...frame.scenes].sort((left, right) => right.opacity - left.opacity)[0]?.sceneId ??
		SCENES[0].id
	);
}

function VideoArtwork({ layer }: SceneVideoRenderInput) {
	const travel = Math.min(layer.sourceTimeMs / 3_400, 1);
	return (
		<div className="lp-mm-video-art" data-source-time-ms={layer.sourceTimeMs}>
			<div className="lp-mm-video-orbit lp-mm-video-orbit-one" />
			<div className="lp-mm-video-orbit lp-mm-video-orbit-two" />
			<div
				className="lp-mm-video-light"
				style={{ transform: `translate3d(${travel * 26}%, ${travel * -8}%, 0)` }}
			/>
			<div className="lp-mm-video-grain" />
			<span className="lp-mm-video-time">
				00:0{Math.max(1, Math.round(layer.sourceTimeMs / 1_000))}
			</span>
		</div>
	);
}

function resolveLandingAsset(assetId: string) {
	if (assetId === "landing-image") {
		return { assetId, src: IMAGE_SOURCE };
	}
	if (assetId === "landing-video") {
		return { assetId, src: "data:video/mp4;base64," };
	}
	return null;
}

function transitionLabel(sceneIndex: number): string {
	if (sceneIndex === 0) {
		return "Crossfade";
	}
	if (sceneIndex === 1) {
		return "Magic move";
	}
	return "Cut";
}

/**
 * A second, deliberately compact proof that motion applies to the whole scene
 * graph. It runs only while visible and leaves the hero user-controlled.
 */
export function MultimediaMotionStudy() {
	const playback = useMultimediaPlayback(LANDING_MULTIMEDIA_DOCUMENT, { fps: FPS, loop: true });
	const { ref, inView } = useInViewPlayback<HTMLDivElement>();
	const reduceMotion = useReducedMotion();
	const { pause, play } = playback;

	useEffect(() => {
		if (inView && !reduceMotion && typeof requestAnimationFrame !== "undefined") {
			play();
			return pause;
		}
		pause();
	}, [inView, pause, play, reduceMotion]);

	const frame = playback.timeline.frameAt(playback.currentFrame);
	const active = activeSceneId(frame);
	const activeIndex = Math.max(
		SCENES.findIndex((scene) => scene.id === active),
		0,
	);
	const scene = SCENES[activeIndex] ?? SCENES[0];
	const next = SCENES[(activeIndex + 1) % SCENES.length] ?? SCENES[0];
	const transition = transitionLabel(activeIndex);

	return (
		<div ref={ref} className="lp-mm-motion-study" data-multimedia-motion-study>
			<div className="lp-mm-motion-head">
				<span>Scene 0{activeIndex + 1}</span>
				<strong>{scene.kind}</strong>
				<em>{transition}</em>
			</div>
			<div className="lp-mm-motion-canvas">
				<MultimediaSceneFrame
					document={LANDING_MULTIMEDIA_DOCUMENT}
					frame={frame}
					resolveAsset={resolveLandingAsset}
					renderVideo={(input) => <VideoArtwork {...input} />}
					style={{ width: "100%", height: "100%" }}
				/>
			</div>
			<div className="lp-mm-motion-route" aria-label="Current scene transition">
				<span>{scene.label}</span>
				<span className="lp-mm-motion-line" />
				<small>{transition}</small>
				<span className="lp-mm-motion-line" />
				<span>{next.label}</span>
			</div>
		</div>
	);
}

export function MultimediaShowcase() {
	const document = LANDING_MULTIMEDIA_DOCUMENT;
	const playback = useMultimediaPlayback(document, { fps: FPS, loop: true });
	const frame = playback.timeline.frameAt(playback.currentFrame);
	const active = activeSceneId(frame);

	function showScene(startMs: number) {
		playback.pause();
		playback.seekFrame(Math.round((startMs / 1_000) * FPS));
	}

	return (
		<div className="lp-mm-demo" data-playing={playback.playing ? "" : undefined}>
			<div className="lp-mm-demo-header">
				<div>
					<span className="lp-mm-status-dot" aria-hidden="true" />
					<strong>Field notes</strong>
					<span>3 scenes</span>
				</div>
				<div className="lp-mm-media-list" aria-label="Supported media">
					{MEDIA.map((kind) => (
						<span key={kind}>{kind}</span>
					))}
				</div>
			</div>

			<div className="lp-mm-canvas" aria-label="Live multimedia composition">
				<MultimediaSceneFrame
					document={document}
					frame={frame}
					resolveAsset={resolveLandingAsset}
					renderVideo={(input) => <VideoArtwork {...input} />}
					style={{ width: "100%", height: "100%" }}
				/>
				<div className="lp-mm-canvas-badge">
					<span aria-hidden="true" /> Live canvas
				</div>
			</div>

			<div className="lp-mm-transport">
				<button
					type="button"
					className="lp-mm-play"
					aria-label={playback.playing ? "Pause story" : "Play story"}
					aria-pressed={playback.playing}
					onClick={playback.toggle}
				>
					{playback.playing ? <Pause size={15} /> : <Play size={15} />}
				</button>
				<div className="lp-mm-time">
					<span>{(frame.timeMs / 1_000).toFixed(1)}s</span>
					<div aria-hidden="true">
						<i style={{ transform: `scaleX(${frame.progress})` }} />
					</div>
					<span>{(playback.timeline.durationMs / 1_000).toFixed(1)}s</span>
				</div>
			</div>

			<div className="lp-mm-timeline" aria-label="Story scenes">
				{SCENES.map((scene, index) => (
					<button
						type="button"
						key={scene.id}
						aria-label={`Show scene ${index + 1}: ${scene.label}`}
						aria-pressed={scene.id === active}
						data-active={scene.id === active ? "" : undefined}
						onClick={() => showScene(scene.startMs)}
					>
						<span className={`lp-mm-thumb lp-mm-thumb-${index + 1}`} aria-hidden="true">
							<i />
						</span>
						<span>
							<small>0{index + 1}</small>
							<strong>{scene.label}</strong>
							<em>{scene.kind}</em>
						</span>
					</button>
				))}
				<div className="lp-mm-audio-track">
					<span className="lp-mm-wave" aria-hidden="true">
						{WAVE_BARS.map((bar) => (
							<i key={bar.id} style={{ height: `${bar.height}%` }} />
						))}
					</span>
					<strong>Soundtrack</strong>
					<small>Audio · 7.5s</small>
				</div>
			</div>
		</div>
	);
}
