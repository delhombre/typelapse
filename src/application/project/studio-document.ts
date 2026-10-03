import { hydrateProjectDocument } from "./hydrate-project-document";
import { migrateV1ToV2 } from "./migrate-v1-project";
import {
	type CodeBlockPayload,
	type ProjectDocumentV1,
	type ProjectDocumentV2,
	parseProjectDocument,
} from "./project-document";
import type { ProjectStepPayload } from "./project-payload";
import { STUDIO_LIVE_SCENE_ID, type StudioCompositionSnapshot } from "./studio-composition";

const PRIMARY_CODE_CONTINUITY_KEY = "primary-code";

export interface StudioSpineStep extends ProjectStepPayload {
	/** The scene this step draws: the layers above it are attached by this id. */
	readonly id: string;
}

/** The code half of a project, in the shape the code editor and the magic move read. */
export interface StudioSpine extends Omit<ProjectDocumentV1, "steps"> {
	readonly steps: StudioSpineStep[];
}

export interface OpenedStudioDocument {
	readonly document: ProjectDocumentV2;
	readonly spine: StudioSpine;
}

/**
 * What the editor holds when a document has no code at all (text and media
 * only). The live code is never empty: it is what the next Capture takes.
 */
const NO_CODE_EDITOR_SEED = "// Write the code for your next scene here.";

/** The scene's code card, or none for a blank scene (a title card). */
function sceneCode(
	scene: ProjectDocumentV2["project"]["scenes"][number],
): CodeBlockPayload | undefined {
	const codes = scene.blocks.filter((block): block is CodeBlockPayload => block.kind === "code");
	return codes.find((block) => block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY) ?? codes[0];
}

/**
 * The V1 reading of a V2 document's code, normalized by the same reader a V1
 * file goes through, so both formats meet the same import limits and defaults.
 * A blank scene reads as a blank step; the card's settings come from the first
 * scene that has one, or the studio's defaults when none does.
 */
function spineSourceOf(document: ProjectDocumentV2): ProjectDocumentV1 {
	const { project } = document;
	const blocks = project.scenes.map(sceneCode);
	const coded = blocks.filter((block): block is CodeBlockPayload => block !== undefined);
	const first = coded[0];
	const captured = project.legacySource?.hadCapturedSteps ?? true;
	const raw: Record<string, unknown> = {
		title: project.title,
		code: project.legacySource?.liveCode ?? coded.at(-1)?.code ?? NO_CODE_EDITOR_SEED,
		language: first?.language ?? "typescript",
		themeName: first?.themeName ?? "midnight",
		...(first?.fontFamily ? { fontFamily: first.fontFamily } : {}),
		...(first?.borderRadius !== undefined ? { borderRadius: first.borderRadius } : {}),
		background: project.canvas.background,
		windowChrome: first?.chrome,
		showLineNumbers: first?.showLineNumbers,
		lineNumberStart: first?.lineNumberStart,
		framePadding: first?.framePadding,
		cardMargin: first?.cardMargin,
		watermark: project.settings.watermark ?? "",
		progressStyle: project.settings.progressStyle,
		typewriter: project.settings.typewriter,
		focusZoom: project.settings.focusZoom,
		transitionMs: project.settings.transitionMs,
		...(project.settings.transitionEasing
			? { transitionEasing: project.settings.transitionEasing }
			: {}),
		width: project.canvas.width,
		height: project.canvas.height,
		...(project.settings.fps ? { fps: project.settings.fps } : {}),
		steps: captured
			? project.scenes.map((scene, index) => ({
					code: blocks[index]?.code ?? "",
					duration: scene.durationMs,
					...(blocks[index]?.focus ? { focus: blocks[index]?.focus } : {}),
					...(scene.caption ? { caption: scene.caption } : {}),
				}))
			: [],
	};
	const parsed = parseProjectDocument(raw);
	if (parsed.schemaVersion !== 1) {
		throw new Error("Expected the code spine of a project");
	}
	return parsed.document;
}

function keyedSpine(source: ProjectDocumentV1, document: ProjectDocumentV2): StudioSpine {
	return {
		...source,
		steps: source.steps.map((step, index) => {
			const id = document.project.scenes[index]?.id;
			if (!id) {
				throw new Error("Every step needs a scene");
			}
			return { ...step, id };
		}),
	};
}

/**
 * Read a project file (V2, or a legacy V1 file) into what the studio loads.
 *
 * A V1 file migrates with the deterministic legacy ids, and its steps take
 * those scene ids, so the same file opens with the same ids every time. A V2
 * file keeps its own ids. Everything is validated, including the V2 aggregate,
 * before the caller writes anything.
 */
export function openStudioDocument(input: unknown): OpenedStudioDocument {
	const parsed = parseProjectDocument(input);
	const document = parsed.schemaVersion === 1 ? migrateV1ToV2(parsed.document) : parsed.document;
	const source = parsed.schemaVersion === 1 ? parsed.document : spineSourceOf(document);
	hydrateProjectDocument(document);
	return { document, spine: keyedSpine(source, document) };
}

/**
 * The document the studio saves and exports. The composition only mirrors
 * scenes and blocks, so the render settings and the live code are taken from
 * the studio as it stands, or a saved file would replay the settings the
 * composition booted with.
 */
export function studioProjectDocument(
	composition: ProjectDocumentV2,
	snapshot: StudioCompositionSnapshot,
	liveCode: string,
): ProjectDocumentV2 {
	// The last scene with code: a blank scene has none to fall back on.
	const fallbackCode = composition.project.scenes
		.map(sceneCode)
		.filter((block) => block !== undefined)
		.at(-1)?.code;
	const snapshotCode = snapshot.scenes.filter((scene) => scene.code.trim() !== "").at(-1)?.code;
	const code = liveCode.trim() ? liveCode : (snapshotCode ?? fallbackCode ?? NO_CODE_EDITOR_SEED);
	const document: ProjectDocumentV2 = {
		schemaVersion: 2,
		project: {
			...composition.project,
			settings: {
				progressStyle: snapshot.progressStyle,
				transitionMs: snapshot.transitionMs,
				transitionEasing: snapshot.transitionEasing,
				typewriter: snapshot.typewriter,
				focusZoom: snapshot.focusZoom,
				watermark: snapshot.watermark,
				...(snapshot.fps ? { fps: snapshot.fps } : {}),
			},
			legacySource: {
				liveCode: code,
				hadCapturedSteps: snapshot.scenes.some((scene) => scene.id !== STUDIO_LIVE_SCENE_ID),
			},
		},
	};
	const parsed = parseProjectDocument(document);
	if (parsed.schemaVersion !== 2) {
		throw new Error("Expected a V2 project document");
	}
	return parsed.document;
}
