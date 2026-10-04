import { appendsLoopMorph } from "../export/video-script";
import { easeInOutQuart } from "../magic-move/engine";
import type {
	AudioCuePayload,
	BlockPayload,
	BlockPlacementPayload,
	CodeBlockPayload,
	ImageBlockPayload,
	ProjectDocumentV2,
	ScenePayload,
	TextBlockPayload,
	VideoBlockPayload,
} from "../project/project-document";
import { parseProjectDocument } from "../project/project-document";

interface ResolvedLayerBase {
	readonly blockId: string;
	readonly sceneId: string;
	readonly opacity: number;
	readonly placement: BlockPayload["placement"];
	readonly continuityKey?: string;
}

export type ResolvedCodeLayer = ResolvedLayerBase &
	Pick<
		CodeBlockPayload,
		| "kind"
		| "code"
		| "language"
		| "themeName"
		| "fontFamily"
		| "borderRadius"
		| "focus"
		| "chrome"
		| "showLineNumbers"
		| "lineNumberStart"
		| "framePadding"
		| "cardMargin"
	>;

export type ResolvedTextLayer = ResolvedLayerBase &
	Pick<TextBlockPayload, "kind" | "text" | "typography">;

export type ResolvedImageLayer = ResolvedLayerBase &
	Pick<ImageBlockPayload, "kind" | "assetId" | "fit" | "focalPoint" | "borderRadius">;

export type ResolvedVideoLayer = ResolvedLayerBase &
	Pick<
		VideoBlockPayload,
		"kind" | "assetId" | "fit" | "focalPoint" | "borderRadius" | "muted" | "playbackRate"
	> & {
		readonly trimStartMs: number;
		readonly sourceTimeMs: number;
		readonly sourceEnded: boolean;
	};

export type ResolvedSceneLayer =
	| ResolvedCodeLayer
	| ResolvedTextLayer
	| ResolvedImageLayer
	| ResolvedVideoLayer;

export interface ResolvedScene {
	readonly sceneId: string;
	readonly localTimeMs: number;
	readonly opacity: number;
}

export interface ResolvedTransition {
	readonly kind: "crossfade" | "magic-move";
	readonly fromSceneId: string;
	readonly toSceneId: string;
	readonly progress: number;
}

export interface ResolvedAudioCue {
	readonly cueId: string;
	readonly assetId: string;
	readonly sourceTimeMs: number;
	readonly gain: number;
}

export interface SceneTimelineFrame {
	readonly frame: number;
	readonly timeMs: number;
	readonly progress: number;
	readonly scenes: readonly ResolvedScene[];
	readonly layers: readonly ResolvedSceneLayer[];
	readonly transition: ResolvedTransition | null;
	readonly audio: readonly ResolvedAudioCue[];
}

export interface SceneTimeline {
	readonly fps: number;
	readonly durationMs: number;
	readonly totalFrames: number;
	frameAt(frame: number): SceneTimelineFrame;
}

interface HoldSegment {
	readonly kind: "hold";
	readonly sceneIndex: number;
	readonly startMs: number;
	readonly endMs: number;
}

interface TransitionSegment {
	readonly kind: "transition";
	readonly transitionKind: "crossfade" | "magic-move";
	readonly sceneIndex: number;
	/** The next scene, or the first one for the loop morph. */
	readonly targetIndex: number;
	readonly startMs: number;
	readonly endMs: number;
}

type VisualSegment = HoldSegment | TransitionSegment;

function buildVisualSegments(
	scenes: readonly ScenePayload[],
	loopMs: number | null,
): VisualSegment[] {
	const segments: VisualSegment[] = [];
	let cursor = 0;
	for (let index = 0; index < scenes.length; index += 1) {
		const scene = scenes[index];
		if (!scene) {
			continue;
		}
		segments.push({
			kind: "hold",
			sceneIndex: index,
			startMs: cursor,
			endMs: cursor + scene.durationMs,
		});
		cursor += scene.durationMs;

		const transition = scene.transitionOut;
		if (!transition || transition.kind === "cut" || transition.durationMs === 0) {
			continue;
		}
		const next = scenes[index + 1];
		if (!next) {
			segments.push({
				kind: "hold",
				sceneIndex: index,
				startMs: cursor,
				endMs: cursor + transition.durationMs,
			});
			cursor += transition.durationMs;
			continue;
		}
		segments.push({
			kind: "transition",
			transitionKind: transition.kind,
			sceneIndex: index,
			targetIndex: index + 1,
			startMs: cursor,
			endMs: cursor + transition.durationMs,
		});
		cursor += transition.durationMs;
	}
	// The same morph the code-only file appends (`video-script.ts`), so the last
	// frame is the first scene again and the file plays as a seamless loop.
	if (loopMs !== null && loopMs > 0) {
		segments.push({
			kind: "transition",
			transitionKind: "magic-move",
			sceneIndex: scenes.length - 1,
			targetIndex: 0,
			startMs: cursor,
			endMs: cursor + loopMs,
		});
	}
	return segments;
}

function spanProgress(segment: VisualSegment, timeMs: number): number {
	const duration = segment.endMs - segment.startMs;
	if (duration <= 0) {
		return 1;
	}
	return Math.min(Math.max((timeMs - segment.startMs) / duration, 0), 1);
}

function locateVisualSegment(
	segments: readonly VisualSegment[],
	timeMs: number,
): VisualSegment | undefined {
	return (
		segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs) ??
		segments.at(-1)
	);
}

function sceneContributions(
	scenes: readonly ScenePayload[],
	segments: readonly VisualSegment[],
	timeMs: number,
): { readonly scenes: readonly ResolvedScene[]; readonly transition: ResolvedTransition | null } {
	const segment = locateVisualSegment(segments, timeMs);
	if (!segment) {
		return { scenes: [], transition: null };
	}
	const scene = scenes[segment.sceneIndex];
	if (!scene) {
		return { scenes: [], transition: null };
	}
	if (segment.kind === "hold") {
		return {
			scenes: [
				{
					sceneId: scene.id,
					localTimeMs: Math.min(Math.max(timeMs - segment.startMs, 0), scene.durationMs),
					opacity: 1,
				},
			],
			transition: null,
		};
	}

	const next = scenes[segment.targetIndex];
	if (!next) {
		return {
			scenes: [{ sceneId: scene.id, localTimeMs: scene.durationMs, opacity: 1 }],
			transition: null,
		};
	}
	const progress = spanProgress(segment, timeMs);
	const visualProgress =
		segment.transitionKind === "magic-move" ? easeInOutQuart(progress) : progress;
	return {
		scenes: [
			{ sceneId: scene.id, localTimeMs: scene.durationMs, opacity: 1 - visualProgress },
			{ sceneId: next.id, localTimeMs: 0, opacity: visualProgress },
		],
		transition: {
			kind: segment.transitionKind,
			fromSceneId: scene.id,
			toSceneId: next.id,
			progress,
		},
	};
}

function baseLayer(
	block: BlockPayload,
	sceneId: string,
	sceneOpacity: number,
	placement: BlockPlacementPayload,
): ResolvedLayerBase {
	return {
		blockId: block.id,
		sceneId,
		opacity: block.opacity * sceneOpacity,
		placement,
		...(block.continuityKey ? { continuityKey: block.continuityKey } : {}),
	};
}

function resolveLayer(
	block: BlockPayload,
	scene: ResolvedScene,
	placement: BlockPlacementPayload = block.placement,
): ResolvedSceneLayer {
	const base = baseLayer(block, scene.sceneId, scene.opacity, placement);
	switch (block.kind) {
		case "code":
			return {
				...base,
				kind: block.kind,
				code: block.code,
				language: block.language,
				themeName: block.themeName,
				...(block.fontFamily ? { fontFamily: block.fontFamily } : {}),
				...(block.borderRadius !== undefined ? { borderRadius: block.borderRadius } : {}),
				...(block.focus ? { focus: block.focus } : {}),
				chrome: block.chrome,
				showLineNumbers: block.showLineNumbers,
				lineNumberStart: block.lineNumberStart,
				framePadding: block.framePadding,
				cardMargin: block.cardMargin,
			};
		case "text":
			return {
				...base,
				kind: block.kind,
				text: block.text,
				typography: block.typography,
			};
		case "image":
			return {
				...base,
				kind: block.kind,
				assetId: block.assetId,
				fit: block.fit,
				focalPoint: block.focalPoint,
				...(block.borderRadius !== undefined ? { borderRadius: block.borderRadius } : {}),
			};
		case "video": {
			const sourceTimeMs = Math.min(
				block.trim.startMs + scene.localTimeMs * block.playbackRate,
				block.trim.endMs,
			);
			return {
				...base,
				kind: block.kind,
				assetId: block.assetId,
				fit: block.fit,
				focalPoint: block.focalPoint,
				...(block.borderRadius !== undefined ? { borderRadius: block.borderRadius } : {}),
				muted: block.muted,
				playbackRate: block.playbackRate,
				trimStartMs: block.trim.startMs,
				sourceTimeMs,
				sourceEnded: sourceTimeMs >= block.trim.endMs,
			};
		}
	}
}

function continuityId(block: BlockPayload): string | null {
	return block.continuityKey ? `${block.kind}:${block.continuityKey}` : null;
}

function uniqueContinuityBlocks(scene: ScenePayload): ReadonlyMap<string, BlockPayload> {
	const grouped = new Map<string, BlockPayload[]>();
	for (const block of scene.blocks) {
		const id = continuityId(block);
		if (!id) {
			continue;
		}
		const current = grouped.get(id) ?? [];
		current.push(block);
		grouped.set(id, current);
	}
	return new Map(
		[...grouped.entries()].flatMap(([id, blocks]) =>
			blocks.length === 1 && blocks[0] ? [[id, blocks[0]] as const] : [],
		),
	);
}

function mix(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function interpolatePlacement(
	from: BlockPlacementPayload,
	to: BlockPlacementPayload,
	progress: number,
): BlockPlacementPayload {
	return {
		x: mix(from.x, to.x, progress),
		y: mix(from.y, to.y, progress),
		width: mix(from.width, to.width, progress),
		height: mix(from.height, to.height, progress),
	};
}

function magicMovePlacements(
	from: ScenePayload,
	to: ScenePayload,
	progress: number,
): ReadonlyMap<string, BlockPlacementPayload> {
	const fromBlocks = uniqueContinuityBlocks(from);
	const toBlocks = uniqueContinuityBlocks(to);
	const eased = easeInOutQuart(progress);
	const result = new Map<string, BlockPlacementPayload>();
	for (const [id, fromBlock] of fromBlocks) {
		const toBlock = toBlocks.get(id);
		if (!toBlock) {
			continue;
		}
		const placement = interpolatePlacement(fromBlock.placement, toBlock.placement, eased);
		result.set(`${from.id}:${fromBlock.id}`, placement);
		result.set(`${to.id}:${toBlock.id}`, placement);
	}
	return result;
}

function resolveLayers(
	payloadScenes: readonly ScenePayload[],
	activeScenes: readonly ResolvedScene[],
	transition: ResolvedTransition | null,
): readonly ResolvedSceneLayer[] {
	const byId = new Map(payloadScenes.map((scene) => [scene.id, scene]));
	let placements: ReadonlyMap<string, BlockPlacementPayload> = new Map();
	if (transition?.kind === "magic-move") {
		const from = byId.get(transition.fromSceneId);
		const to = byId.get(transition.toSceneId);
		if (from && to) {
			placements = magicMovePlacements(from, to, transition.progress);
		}
	}
	return activeScenes.flatMap((scene) => {
		const payload = byId.get(scene.sceneId);
		return payload
			? payload.blocks.map((block) =>
					resolveLayer(
						block,
						scene,
						placements.get(`${scene.sceneId}:${block.id}`) ?? block.placement,
					),
				)
			: [];
	});
}

function fadeGain(cue: AudioCuePayload, elapsedMs: number): number {
	const durationMs = cue.trim.endMs - cue.trim.startMs;
	const fadeIn = cue.fadeInMs > 0 ? Math.min(elapsedMs / cue.fadeInMs, 1) : 1;
	const remainingMs = durationMs - elapsedMs;
	const fadeOut = cue.fadeOutMs > 0 ? Math.min(remainingMs / cue.fadeOutMs, 1) : 1;
	return cue.gain * Math.max(0, Math.min(fadeIn, fadeOut, 1));
}

function resolveAudio(
	cues: readonly AudioCuePayload[],
	timeMs: number,
): readonly ResolvedAudioCue[] {
	return cues.flatMap((cue) => {
		const elapsedMs = timeMs - cue.startMs;
		const durationMs = cue.trim.endMs - cue.trim.startMs;
		if (elapsedMs < 0 || elapsedMs >= durationMs) {
			return [];
		}
		return [
			{
				cueId: cue.id,
				assetId: cue.assetId,
				sourceTimeMs: cue.trim.startMs + elapsedMs,
				gain: fadeGain(cue, elapsedMs),
			},
		];
	});
}

function visualDurationMs(segments: readonly VisualSegment[]): number {
	return segments.at(-1)?.endMs ?? 0;
}

function audioDurationMs(cues: readonly AudioCuePayload[]): number {
	return cues.reduce(
		(maximum, cue) => Math.max(maximum, cue.startMs + (cue.trim.endMs - cue.trim.startMs)),
		0,
	);
}

/**
 * Whether the file has anything to hear: an audio cue, or a video layer that is
 * not muted. Without one a server render writes no audio track at all, since a
 * silent AAC stream still lengthens the file past the device export.
 */
export function hasAudibleMedia(document: ProjectDocumentV2): boolean {
	return (
		document.project.audioCues.length > 0 ||
		document.project.scenes.some((scene) =>
			scene.blocks.some((block) => block.kind === "video" && !block.muted),
		)
	);
}

/**
 * Compile the authored scene model into deterministic frame data. The result
 * contains no URLs, DOM nodes or decoded bytes: every renderer resolves the
 * same layer order, transition weights, media source time and audio envelope.
 */
export function compileSceneTimeline({
	document,
	fps,
	loop = false,
}: {
	readonly document: ProjectDocumentV2;
	readonly fps: number;
	/** Loop on: the last scene morphs back to the first for the project's transition. */
	readonly loop?: boolean;
}): SceneTimeline {
	if (!Number.isSafeInteger(fps) || fps <= 0) {
		throw new Error("Render fps must be a positive integer");
	}
	const parsed = parseProjectDocument(document);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Expected a V2 project document");
	}
	const project = parsed.document.project;
	const segments = buildVisualSegments(
		project.scenes,
		appendsLoopMorph(loop, project.scenes.length) ? project.settings.transitionMs : null,
	);
	const durationMs = Math.max(visualDurationMs(segments), audioDurationMs(project.audioCues));
	const totalFrames = Math.max(1, Math.round((durationMs / 1_000) * fps));

	return {
		fps,
		durationMs,
		totalFrames,
		frameAt(requestedFrame: number): SceneTimelineFrame {
			const frame = Math.min(Math.max(Math.floor(requestedFrame), 0), totalFrames - 1);
			const timeMs = (frame / fps) * 1_000;
			const visualTimeMs = Math.min(timeMs, visualDurationMs(segments));
			const contribution = sceneContributions(project.scenes, segments, visualTimeMs);
			return {
				frame,
				timeMs,
				progress: durationMs > 0 ? Math.min(timeMs / durationMs, 1) : 0,
				scenes: contribution.scenes,
				layers: resolveLayers(project.scenes, contribution.scenes, contribution.transition),
				transition: contribution.transition,
				audio: resolveAudio(project.audioCues, timeMs),
			};
		},
	};
}
