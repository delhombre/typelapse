import {
	type Block,
	CodeBlock,
	ImageBlock,
	TextBlock,
	VideoBlock,
} from "../../domain/entities/block";
import { Project } from "../../domain/entities/project";
import { Scene } from "../../domain/entities/scene";
import type { CubicBezier } from "../magic-move/easing";
import { hydrateProjectDocument } from "./hydrate-project-document";
import { newTextLayer } from "./multimedia-authoring";
import { type ProjectDocumentV2, parseProjectDocument } from "./project-document";
import type {
	ProjectFps,
	ProjectProgressStyle,
	ProjectTempoMs,
	ProjectWindowChrome,
} from "./project-payload";

export const STUDIO_LIVE_SCENE_ID = "studio-live-scene";

export interface StudioCompositionSceneSnapshot {
	readonly id: string;
	readonly code: string;
	readonly durationMs: number;
	readonly caption?: string;
	readonly focus?: string;
}

export interface StudioCompositionSnapshot {
	readonly projectId: string;
	readonly title: string;
	readonly language: string;
	readonly themeName: string;
	readonly fontFamily: string;
	readonly borderRadius: number;
	readonly background: string;
	readonly windowChrome: ProjectWindowChrome;
	readonly showLineNumbers: boolean;
	readonly lineNumberStart: number;
	readonly framePadding: number;
	readonly cardMargin: number;
	readonly canvas: { readonly width: number; readonly height: number };
	readonly transitionMs: ProjectTempoMs;
	readonly transitionEasing: CubicBezier;
	readonly typewriter: boolean;
	readonly focusZoom: boolean;
	readonly progressStyle: ProjectProgressStyle;
	readonly watermark: string;
	readonly fps?: ProjectFps;
	readonly scenes: readonly StudioCompositionSceneSnapshot[];
}

export interface StudioPlaybackPosition {
	readonly phase: "hold" | "transition";
	readonly index: number;
	readonly t: number;
}

const PRIMARY_CODE_CONTINUITY_KEY = "primary-code";
const FULL_CANVAS = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

export type StudioSceneLayerKind = "text" | "image" | "video" | "audio";

/**
 * Compact capability summary for the accepted Studio timeline. Audio is global
 * in the V2 aggregate, so it belongs to a scene when its cue overlaps that
 * scene's hold. Transitions remain visual gaps and never double-count a cue.
 */
export function studioSceneLayerKinds(
	project: Pick<Project, "scenes" | "audioCues">,
	sceneId: string,
): readonly StudioSceneLayerKind[] {
	let sceneStartMs = 0;
	let sceneEndMs = 0;
	let selected: (typeof project.scenes)[number] | undefined;
	for (const scene of project.scenes) {
		if (scene.id === sceneId) {
			selected = scene;
			sceneEndMs = sceneStartMs + scene.durationMs;
			break;
		}
		sceneStartMs += scene.durationMs + (scene.transitionOut?.durationMs ?? 0);
	}
	if (!selected) {
		return [];
	}

	const present = new Set<StudioSceneLayerKind>();
	for (const block of selected.blocks) {
		if (block.kind !== "code") {
			present.add(block.kind);
		}
	}
	if (project.audioCues.some((cue) => cue.startMs < sceneEndMs && cue.endMs > sceneStartMs)) {
		present.add("audio");
	}
	return (["text", "image", "video", "audio"] as const).filter((kind) => present.has(kind));
}

/** Map the accepted Studio playback cursor onto the multimedia scene clock. */
export function studioCompositionTimeMs(
	scenes: readonly Pick<StudioCompositionSceneSnapshot, "durationMs">[],
	transitionMs: number,
	currentSceneIndex: number,
	playback: StudioPlaybackPosition | null,
): number {
	if (scenes.length === 0) {
		return 0;
	}
	const requestedIndex = playback?.index ?? currentSceneIndex;
	const index = Math.min(Math.max(Math.floor(requestedIndex), 0), scenes.length - 1);
	let elapsed = 0;
	for (let sceneIndex = 0; sceneIndex < index; sceneIndex += 1) {
		elapsed += scenes[sceneIndex]?.durationMs ?? 0;
		if (sceneIndex < scenes.length - 1) {
			elapsed += transitionMs;
		}
	}
	if (!playback) {
		return elapsed;
	}
	const progress = Math.min(Math.max(playback.t, 0), 1);
	const durationMs = scenes[index]?.durationMs ?? 0;
	if (playback.phase === "hold") {
		return elapsed + progress * durationMs;
	}
	return elapsed + durationMs + progress * transitionMs;
}

/**
 * A stored scene's card code as a step carries it: empty for a blank scene, so
 * a blank scene is matched by a blank step and never by a code one.
 */
function primaryCodeText(
	blocks: readonly {
		readonly kind: string;
		readonly continuityKey?: string;
		readonly code?: string;
	}[],
): string {
	const primary = blocks.find(
		(block) => block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY,
	);
	return primary?.code ?? "";
}

function primaryCode(blocks: readonly Block[]): CodeBlock | undefined {
	return blocks.find(
		(block): block is CodeBlock =>
			block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY,
	);
}

function createPrimaryCode(
	scene: StudioCompositionSceneSnapshot,
	snapshot: StudioCompositionSnapshot,
	existing?: CodeBlock,
): CodeBlock {
	return CodeBlock.create({
		id: existing?.id ?? `${scene.id}::primary-code`,
		code: scene.code,
		language: snapshot.language,
		themeName: snapshot.themeName,
		fontFamily: snapshot.fontFamily,
		borderRadius: snapshot.borderRadius,
		...(scene.focus ? { focus: scene.focus } : {}),
		chrome: snapshot.windowChrome,
		showLineNumbers: snapshot.showLineNumbers,
		lineNumberStart: snapshot.lineNumberStart,
		framePadding: snapshot.framePadding,
		cardMargin: snapshot.cardMargin,
		continuityKey: PRIMARY_CODE_CONTINUITY_KEY,
		opacity: existing?.opacity ?? 1,
		placement: existing?.placement ?? FULL_CANVAS,
	});
}

function clonedBlockId(sceneId: string, block: Block): string {
	return `${sceneId}::${block.kind}::${block.id}`;
}

function cloneBlock(block: Block, sceneId: string): Block {
	const shared = {
		id: clonedBlockId(sceneId, block),
		placement: block.placement,
		opacity: block.opacity,
		...(block.continuityKey ? { continuityKey: block.continuityKey } : {}),
	};
	if (block.kind === "text") {
		return TextBlock.create({ ...shared, text: block.text, typography: block.typography });
	}
	if (block.kind === "code") {
		return CodeBlock.create({
			...shared,
			code: block.code,
			language: block.language,
			themeName: block.themeName,
			fontFamily: block.fontFamily,
			borderRadius: block.borderRadius,
			...(block.focus ? { focus: block.focus } : {}),
			chrome: block.chrome,
			showLineNumbers: block.showLineNumbers,
			lineNumberStart: block.lineNumberStart,
			framePadding: block.framePadding,
			cardMargin: block.cardMargin,
		});
	}
	if (block.kind === "image") {
		return ImageBlock.create({
			...shared,
			assetId: block.assetId,
			fit: block.fit,
			focalPoint: block.focalPoint,
			borderRadius: block.borderRadius,
		});
	}
	return VideoBlock.create({
		...shared,
		assetId: block.assetId,
		fit: block.fit,
		focalPoint: block.focalPoint,
		borderRadius: block.borderRadius,
		trim: block.trim,
		playbackRate: block.playbackRate,
		muted: block.muted,
	});
}

function synchronizedBlocks(
	source: Scene | undefined,
	target: StudioCompositionSceneSnapshot,
	snapshot: StudioCompositionSnapshot,
): readonly Block[] {
	if (target.code === "") {
		// A blank scene has no card: its other layers stay, the card goes.
		return (source?.blocks ?? []).flatMap((block) =>
			block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY
				? []
				: [source?.id === target.id ? block : cloneBlock(block, target.id)],
		);
	}
	const sourceCode = source ? primaryCode(source.blocks) : undefined;
	const code = createPrimaryCode(
		target,
		snapshot,
		source?.id === target.id ? sourceCode : undefined,
	);
	if (!source) {
		return [code];
	}

	let replacedPrimary = false;
	const blocks = source.blocks.flatMap((block) => {
		if (block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY) {
			replacedPrimary = true;
			return [code];
		}
		return [source.id === target.id ? block : cloneBlock(block, target.id)];
	});
	if (replacedPrimary) {
		return blocks;
	}
	const firstOverlay = blocks.findIndex((block) => block.kind === "text" || block.kind === "code");
	const insertionIndex = firstOverlay < 0 ? blocks.length : firstOverlay;
	return [...blocks.slice(0, insertionIndex), code, ...blocks.slice(insertionIndex)];
}

/**
 * A project needs a visual block or an audio cue, so when every scene is blank
 * and bare (a Blank added to a fresh studio, the last code scene deleted) the
 * first one starts as a title card, with the layer "Add text" would create.
 */
function starterTitle(sceneId: string): TextBlock {
	return newTextLayer({ id: `${sceneId}::title` });
}

function transitionFor(
	index: number,
	sceneCount: number,
	transitionMs: number,
): { readonly kind: "magic-move"; readonly durationMs: number } | undefined {
	if (index >= sceneCount - 1) {
		return undefined;
	}
	return { kind: "magic-move", durationMs: transitionMs };
}

/**
 * Keep the accepted code Studio as the scene authority while retaining every
 * authored multimedia layer. Scene ids are the existing Step ids, so timeline
 * selection, reorder, delete and undo stay one operation instead of two editors
 * that merely look synchronized.
 */
export function synchronizeStudioComposition(
	project: Project,
	snapshot: StudioCompositionSnapshot,
	restoredScenes: ReadonlyMap<string, Scene> = new Map(),
): Project {
	const existingById = new Map(project.scenes.map((scene) => [scene.id, scene]));
	const scenes: Scene[] = [];
	for (const [index, target] of snapshot.scenes.entries()) {
		const exact = existingById.get(target.id) ?? restoredScenes.get(target.id);
		// A new scene continues the one before it only when both are the same
		// kind: a title card is not carried over the code that follows it.
		const previous = scenes
			.slice(-1)
			.find((scene) => (primaryCode(scene.blocks) !== undefined) === (target.code !== ""));
		const liveFallback =
			index === 0 && project.scenes.length === 1 && project.scenes[0]?.id === STUDIO_LIVE_SCENE_ID
				? project.scenes[0]
				: undefined;
		const source = exact ?? previous ?? liveFallback;
		const transitionOut = transitionFor(index, snapshot.scenes.length, snapshot.transitionMs);
		scenes.push(
			Scene.create({
				id: target.id,
				durationMs: target.durationMs,
				blocks: synchronizedBlocks(source, target, snapshot),
				...(target.caption ? { caption: target.caption } : {}),
				...(transitionOut ? { transitionOut } : {}),
			}),
		);
	}
	const first = scenes[0];
	if (
		first &&
		project.audioCues.length === 0 &&
		scenes.every((scene) => scene.blocks.length === 0)
	) {
		scenes[0] = Scene.create({
			id: first.id,
			durationMs: first.durationMs,
			blocks: [starterTitle(first.id)],
			...(first.caption ? { caption: first.caption } : {}),
			...(first.transitionOut ? { transitionOut: first.transitionOut } : {}),
		});
	}

	return Project.create({
		id: project.id,
		title: snapshot.title,
		canvas: {
			width: snapshot.canvas.width,
			height: snapshot.canvas.height,
			background: snapshot.background,
		},
		assets: project.assets,
		audioCues: project.audioCues,
		scenes,
	});
}

/**
 * The ids the live Studio scenes take from a stored composition.
 *
 * Step ids are not part of the draft payload, so every boot mints fresh ones
 * while the composition saved in IndexedDB, and the history saved with it,
 * still carry last session's. The boot hands the stored ids to the code spine
 * rather than re-keying what was stored, so a reload changes no id anywhere. A
 * live scene takes the stored id at its position only when the primary code is
 * identical, which keeps a different project's ids off an imported one.
 */
export function storedSceneIdsFor(
	document: ProjectDocumentV2,
	scenes: StudioCompositionSnapshot["scenes"],
): string[] {
	const liveIds = new Set(scenes.map((scene) => scene.id));
	return scenes.map((target, index) => {
		const stored = document.project.scenes[index];
		if (!stored || stored.id === target.id || liveIds.has(stored.id)) {
			return target.id;
		}
		return primaryCodeText(stored.blocks) === target.code ? stored.id : target.id;
	});
}

/**
 * Re-key a stored composition onto the live Studio scene ids: the converse of
 * {@link storedSceneIdsFor}, for a document whose ids the spine cannot take (a
 * live code project shows one scene under the Studio's live id). Synchronization
 * matches scenes by id, so without it every authored layer would be dropped on
 * the first edit. Same rule: same position, identical primary code.
 */
export function adoptStoredSceneIds(
	document: ProjectDocumentV2,
	snapshot: StudioCompositionSnapshot,
): ProjectDocumentV2 {
	const storedIds = new Set(document.project.scenes.map((scene) => scene.id));
	let changed = false;
	const scenes = document.project.scenes.map((scene, index) => {
		const target = snapshot.scenes[index];
		if (!target || target.id === scene.id || storedIds.has(target.id)) {
			return scene;
		}
		if (primaryCodeText(scene.blocks) !== target.code) {
			return scene;
		}
		changed = true;
		return { ...scene, id: target.id };
	});
	return changed ? { ...document, project: { ...document.project, scenes } } : document;
}

export function createStudioCompositionDocument(
	snapshot: StudioCompositionSnapshot,
): ProjectDocumentV2 {
	const liveCode = snapshot.scenes.filter((scene) => scene.code !== "").at(-1)?.code;
	const seed: ProjectDocumentV2 = {
		schemaVersion: 2,
		project: {
			id: snapshot.projectId,
			title: snapshot.title,
			canvas: {
				width: snapshot.canvas.width,
				height: snapshot.canvas.height,
				background: snapshot.background,
			},
			settings: {
				progressStyle: snapshot.progressStyle,
				transitionMs: snapshot.transitionMs,
				transitionEasing: snapshot.transitionEasing,
				typewriter: snapshot.typewriter,
				focusZoom: snapshot.focusZoom,
				watermark: snapshot.watermark,
				...(snapshot.fps ? { fps: snapshot.fps } : {}),
			},
			assets: [],
			audioCues: [],
			// The last scene with code; a project of blank scenes has none to keep.
			...(liveCode
				? {
						legacySource: {
							liveCode,
							hadCapturedSteps: snapshot.scenes[0]?.id !== STUDIO_LIVE_SCENE_ID,
						},
					}
				: {}),
			scenes: snapshot.scenes.map((scene, index) => ({
				id: scene.id,
				durationMs: scene.durationMs,
				...(scene.caption ? { caption: scene.caption } : {}),
				...(index < snapshot.scenes.length - 1
					? {
							transitionOut: {
								kind: "magic-move" as const,
								durationMs: snapshot.transitionMs,
							},
						}
					: {}),
				// A blank scene starts with no block at all.
				blocks: scene.code
					? [
							{
								id: `${scene.id}::primary-code`,
								kind: "code" as const,
								code: scene.code,
								language: snapshot.language,
								themeName: snapshot.themeName,
								fontFamily: snapshot.fontFamily,
								borderRadius: snapshot.borderRadius,
								...(scene.focus ? { focus: scene.focus } : {}),
								chrome: snapshot.windowChrome,
								showLineNumbers: snapshot.showLineNumbers,
								lineNumberStart: snapshot.lineNumberStart,
								framePadding: snapshot.framePadding,
								cardMargin: snapshot.cardMargin,
								continuityKey: PRIMARY_CODE_CONTINUITY_KEY,
								opacity: 1,
								placement: FULL_CANVAS,
							},
						]
					: [],
			})),
		},
	};
	const firstScene = seed.project.scenes[0];
	if (firstScene && !liveCode) {
		const title = starterTitle(firstScene.id);
		firstScene.blocks = [
			{
				id: title.id,
				kind: "text",
				text: title.text,
				typography: { ...title.typography },
				opacity: title.opacity,
				placement: { ...title.placement },
			},
		];
	}
	const parsed = parseProjectDocument(seed);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Expected a Studio composition document");
	}
	// Hydration exercises all aggregate invariants here, at the adapter boundary,
	// rather than leaving the first source action to discover malformed state.
	hydrateProjectDocument(parsed.document);
	return parsed.document;
}
