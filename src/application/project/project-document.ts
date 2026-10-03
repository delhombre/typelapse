import { MAX_MEDIA_BORDER_RADIUS } from "../../domain/entities/block";
import { MAX_RENDER_DIMENSION, MIN_RENDER_DIMENSION } from "../../domain/entities/render-config";
import { MAX_SCENE_CAPTION_LENGTH } from "../../domain/entities/scene";
import { captionFromGeneratedLabel } from "../../domain/entities/step";
import { type CubicBezier, isCubicBezier } from "../magic-move/easing";
import {
	type ProjectFps,
	type ProjectPayload,
	type ProjectProgressStyle,
	type ProjectTempoMs,
	type ProjectWindowChrome,
	isProjectFps,
} from "./project-payload";

export type ProjectDocumentV1 = ProjectPayload;

export interface BlockPlacementPayload {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BlockBasePayload {
	id: string;
	opacity: number;
	placement: BlockPlacementPayload;
	continuityKey?: string;
}

export interface CodeBlockPayload extends BlockBasePayload {
	kind: "code";
	code: string;
	language: string;
	themeName: string;
	fontFamily?: string;
	borderRadius?: number;
	focus?: string;
	chrome: ProjectWindowChrome;
	showLineNumbers: boolean;
	lineNumberStart: number;
	framePadding: number;
	cardMargin: number;
}

export interface TextBlockPayload extends BlockBasePayload {
	kind: "text";
	text: string;
	typography: {
		fontFamily: string;
		fontSize: number;
		fontWeight: number;
		color: string;
		align: "left" | "center" | "right";
	};
}

export interface ImageBlockPayload extends BlockBasePayload {
	kind: "image";
	assetId: string;
	fit: "cover" | "contain";
	focalPoint: { x: number; y: number };
	borderRadius?: number;
}

export interface VideoBlockPayload extends BlockBasePayload {
	kind: "video";
	assetId: string;
	fit: "cover" | "contain";
	focalPoint: { x: number; y: number };
	borderRadius?: number;
	trim: { startMs: number; endMs: number };
	playbackRate: number;
	muted: boolean;
}

export type BlockPayload =
	| CodeBlockPayload
	| TextBlockPayload
	| ImageBlockPayload
	| VideoBlockPayload;

interface AssetMetadataBasePayload {
	id: string;
	fileName: string;
	mimeType: string;
	byteSize: number;
	checksum: string;
}

export interface ImageAssetMetadataPayload extends AssetMetadataBasePayload {
	kind: "image";
	width: number;
	height: number;
}

export interface VideoAssetMetadataPayload extends AssetMetadataBasePayload {
	kind: "video";
	width: number;
	height: number;
	durationMs: number;
}

export interface AudioAssetMetadataPayload extends AssetMetadataBasePayload {
	kind: "audio";
	durationMs: number;
}

export type AssetMetadataPayload =
	| ImageAssetMetadataPayload
	| VideoAssetMetadataPayload
	| AudioAssetMetadataPayload;

export interface AudioCuePayload {
	id: string;
	assetId: string;
	startMs: number;
	trim: { startMs: number; endMs: number };
	gain: number;
	fadeInMs: number;
	fadeOutMs: number;
}

export interface ScenePayload {
	id: string;
	durationMs: number;
	blocks: BlockPayload[];
	caption?: string;
	transitionOut?: {
		kind: "cut" | "crossfade" | "magic-move";
		durationMs: number;
	};
}

export interface ProjectDocumentV2 {
	schemaVersion: 2;
	project: {
		id: string;
		title: string;
		canvas: { width: number; height: number; background: string };
		settings: {
			progressStyle: ProjectProgressStyle;
			transitionMs: ProjectTempoMs;
			transitionEasing?: CubicBezier;
			typewriter: boolean;
			focusZoom: boolean;
			watermark?: string;
			fps?: ProjectFps;
		};
		assets: AssetMetadataPayload[];
		audioCues: AudioCuePayload[];
		scenes: ScenePayload[];
		/** Compatibility metadata retained only for a migrated V1 document. */
		legacySource?: { liveCode: string; hadCapturedSteps: boolean };
	};
}

export type ParsedProjectDocument =
	| { schemaVersion: 1; document: ProjectDocumentV1 }
	| { schemaVersion: 2; document: ProjectDocumentV2 };

const THEMES = new Set([
	"midnight",
	"aurora",
	"frost",
	"dracula",
	"one-dark",
	"catppuccin",
	"nord",
]);
const MARGINS = [16, 24, 32, 48, 64] as const;

/**
 * The longest step the Studio can hold. Mirrors the timeline editor's
 * `MAX_STEP_DURATION_MS` (kept literal here because this module is shared with
 * the server and stays on relative imports). An unbounded duration from a file
 * once built a tick array per second of a 30,000-year timeline and crashed the
 * Studio on every boot, because the draft had already saved it.
 */
export const MAX_IMPORTED_STEP_DURATION_MS = 10_000;

/**
 * What one document may ask the Studio to tokenize. Highlighting is linear in
 * code size but runs on the main thread: around 12,000 lines froze the tab for
 * seconds and a 100 MB string never came back. These bounds sit well above any
 * code a video can show, and they are checked before anything is mutated.
 */
export const MAX_IMPORTED_STEPS = 500;
export const MAX_IMPORTED_CODE_LINES = 5_000;
export const MAX_IMPORTED_CODE_CHARACTERS = 1_000_000;

/**
 * Throw a user-facing error when code is too large to import. `label` names the
 * thing being imported so the message says what to shorten.
 */
export function assertImportableCode(code: string, label = "This code"): void {
	if (code.length > MAX_IMPORTED_CODE_CHARACTERS) {
		throw new Error(
			`${label} is too large to animate (over ${MAX_IMPORTED_CODE_CHARACTERS.toLocaleString("en-US")} characters).`,
		);
	}
	let lines = 1;
	for (let index = code.indexOf("\n"); index !== -1; index = code.indexOf("\n", index + 1)) {
		lines += 1;
		if (lines > MAX_IMPORTED_CODE_LINES) {
			throw new Error(
				`${label} is too long to animate (over ${MAX_IMPORTED_CODE_LINES.toLocaleString("en-US")} lines).`,
			);
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string,
): void {
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) {
			throw new Error(`Unexpected ${label} field '${key}'`);
		}
	}
}

function requiredString(value: unknown, message: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(message);
	}
	return value;
}

function finiteNumber(value: unknown, message: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(message);
	}
	return value;
}

function booleanValue(value: unknown, message: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(message);
	}
	return value;
}

function positiveInteger(value: unknown, message: string): number {
	const number = finiteNumber(value, message);
	if (!Number.isSafeInteger(number) || number <= 0) {
		throw new Error(message);
	}
	return number;
}

function nonNegativeInteger(value: unknown, message: string): number {
	const number = finiteNumber(value, message);
	if (!Number.isSafeInteger(number) || number < 0) {
		throw new Error(message);
	}
	return number;
}

function nonNegativeNumber(value: unknown, message: string): number {
	const number = finiteNumber(value, message);
	if (number < 0) {
		throw new Error(message);
	}
	return number;
}

function normalizeMargin(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 32;
	}
	return MARGINS.reduce((best, margin) =>
		Math.abs(margin - value) < Math.abs(best - value) ? margin : best,
	);
}

function isDimension(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_RENDER_DIMENSION &&
		value <= MAX_RENDER_DIMENSION
	);
}

function normalizeV1(input: Record<string, unknown>): ProjectDocumentV1 {
	const title = requiredString(input.title, "Missing or invalid 'title'");
	const code = requiredString(input.code, "Missing or invalid 'code'");
	const language = requiredString(input.language, "Missing or invalid 'language'");
	const themeName = requiredString(input.themeName, "Missing or invalid 'themeName'");
	if (!THEMES.has(themeName)) {
		throw new Error(`Unknown theme '${themeName}'`);
	}

	assertImportableCode(code, "The project code");

	const steps = input.steps === undefined ? [] : input.steps;
	if (!Array.isArray(steps)) {
		throw new Error("Invalid 'steps'");
	}
	if (steps.length > MAX_IMPORTED_STEPS) {
		throw new Error(
			`This project has ${steps.length.toLocaleString("en-US")} steps; Typelapse opens at most ${MAX_IMPORTED_STEPS}.`,
		);
	}
	let totalCharacters = code.length;
	const normalizedSteps = steps.map((raw, index) => {
		if (!isRecord(raw)) {
			throw new Error("Each step must be an object");
		}
		if (typeof raw.code !== "string") {
			throw new Error("Each step must have a 'code'");
		}
		// Empty code is a blank step (a title card): its scene draws no code card.
		const stepCode = raw.code.trim() === "" ? "" : raw.code;
		assertImportableCode(stepCode, `Step ${index + 1}`);
		totalCharacters += stepCode.length;
		if (totalCharacters > MAX_IMPORTED_CODE_CHARACTERS) {
			throw new Error(
				`This project is too large to animate (over ${MAX_IMPORTED_CODE_CHARACTERS.toLocaleString("en-US")} characters of code).`,
			);
		}
		// Whole milliseconds inside the editor's range: a scene duration is a safe
		// integer in the V2 aggregate, and the timeline draws one tick per second.
		const duration =
			typeof raw.duration === "number" && Number.isFinite(raw.duration) && raw.duration > 0
				? Math.min(Math.max(Math.round(raw.duration), 1), MAX_IMPORTED_STEP_DURATION_MS)
				: 1000;
		const focus = typeof raw.focus === "string" && raw.focus.trim() !== "" ? raw.focus : undefined;
		const caption =
			typeof raw.caption === "string" ? captionFromGeneratedLabel(raw.caption) : undefined;
		return {
			code: stepCode,
			duration,
			...(focus ? { focus } : {}),
			...(caption ? { caption } : {}),
		};
	});

	const width = isDimension(input.width) ? input.width : undefined;
	const height = isDimension(input.height) ? input.height : undefined;
	const bothDimensions = width !== undefined && height !== undefined;
	const windowChrome =
		input.windowChrome === "browser" ||
		input.windowChrome === "terminal" ||
		input.windowChrome === "none" ||
		input.windowChrome === "macos"
			? input.windowChrome
			: "macos";
	const progressStyle =
		input.progressStyle === "bar" ||
		input.progressStyle === "none" ||
		input.progressStyle === "reels"
			? input.progressStyle
			: "reels";
	const transitionMs =
		input.transitionMs === 400 || input.transitionMs === 650 || input.transitionMs === 1000
			? input.transitionMs
			: 650;
	const transitionEasing = isCubicBezier(input.transitionEasing)
		? input.transitionEasing
		: undefined;

	return {
		title,
		code,
		language,
		themeName,
		background: typeof input.background === "string" ? input.background : "mesh:solar",
		steps: normalizedSteps,
		windowChrome,
		showLineNumbers: typeof input.showLineNumbers === "boolean" ? input.showLineNumbers : true,
		// Both fall back like every other cosmetic field rather than reaching the
		// V2 code block, which refuses them and would fail the import halfway.
		lineNumberStart:
			typeof input.lineNumberStart === "number" &&
			input.lineNumberStart >= 1 &&
			Number.isSafeInteger(Math.floor(input.lineNumberStart))
				? Math.floor(input.lineNumberStart)
				: 1,
		framePadding:
			typeof input.framePadding === "number" &&
			Number.isFinite(input.framePadding) &&
			input.framePadding >= 0
				? input.framePadding
				: 24,
		cardMargin: normalizeMargin(input.cardMargin),
		watermark: typeof input.watermark === "string" ? input.watermark : "",
		progressStyle,
		typewriter: input.typewriter === true,
		focusZoom: input.focusZoom === true,
		transitionMs,
		...(transitionEasing ? { transitionEasing } : {}),
		width: bothDimensions ? width : 1920,
		height: bothDimensions ? height : 1080,
		...(isProjectFps(input.fps) ? { fps: input.fps } : {}),
		...(typeof input.fontFamily === "string" && input.fontFamily.trim() !== ""
			? { fontFamily: input.fontFamily }
			: {}),
		...(typeof input.borderRadius === "number" &&
		Number.isFinite(input.borderRadius) &&
		input.borderRadius >= 0
			? { borderRadius: input.borderRadius }
			: {}),
	};
}

function assertUnit(value: unknown, label: string): number {
	const number = finiteNumber(value, `${label} must be a finite number`);
	if (number < 0 || number > 1) {
		throw new Error(`${label} must be between 0 and 1`);
	}
	return number;
}

function validatePlacement(value: unknown): void {
	if (!isRecord(value)) {
		throw new Error("Block placement must be an object");
	}
	assertOnlyKeys(value, ["x", "y", "width", "height"], "block placement");
	assertUnit(value.x, "Block x");
	assertUnit(value.y, "Block y");
	const width = assertUnit(value.width, "Block width");
	const height = assertUnit(value.height, "Block height");
	if (width === 0 || height === 0) {
		throw new Error("Block placement must have positive size");
	}
	const x = finiteNumber(value.x, "Block x must be a finite number");
	const y = finiteNumber(value.y, "Block y must be a finite number");
	if (x + width > 1 || y + height > 1) {
		throw new Error("Block placement must stay inside the canvas");
	}
}

function validateBlock(block: unknown, assets: ReadonlyMap<string, AssetMetadataPayload>): string {
	if (!isRecord(block)) {
		throw new Error("Each block must be an object");
	}
	const id = requiredString(block.id, "Each block needs an id");
	assertUnit(block.opacity, "Block opacity");
	validatePlacement(block.placement);
	if (block.continuityKey !== undefined) {
		requiredString(block.continuityKey, "Block continuity key must not be empty");
	}

	if (block.kind === "code") {
		assertOnlyKeys(
			block,
			[
				"id",
				"kind",
				"opacity",
				"placement",
				"continuityKey",
				"code",
				"language",
				"themeName",
				"fontFamily",
				"borderRadius",
				"focus",
				"chrome",
				"showLineNumbers",
				"lineNumberStart",
				"framePadding",
				"cardMargin",
			],
			"code block",
		);
		requiredString(block.code, "Code blocks need code");
		requiredString(block.language, "Code blocks need a language");
		requiredString(block.themeName, "Code blocks need a theme");
		if (block.fontFamily !== undefined) {
			requiredString(block.fontFamily, "Code block font family must not be empty");
		}
		if (block.borderRadius !== undefined) {
			nonNegativeNumber(block.borderRadius, "Code block border radius must be non-negative");
		}
		if (block.focus !== undefined && typeof block.focus !== "string") {
			throw new Error("Code block focus must be a string");
		}
		if (
			block.chrome !== "macos" &&
			block.chrome !== "browser" &&
			block.chrome !== "terminal" &&
			block.chrome !== "none"
		) {
			throw new Error(`Unsupported code window chrome '${String(block.chrome)}'`);
		}
		booleanValue(block.showLineNumbers, "Code block line-number visibility must be boolean");
		positiveInteger(block.lineNumberStart, "Code block line-number start must be positive");
		nonNegativeNumber(block.framePadding, "Code block frame padding must be non-negative");
		nonNegativeNumber(block.cardMargin, "Code block card margin must be non-negative");
		return id;
	}
	if (block.kind === "text") {
		assertOnlyKeys(
			block,
			["id", "kind", "opacity", "placement", "continuityKey", "text", "typography"],
			"text block",
		);
		requiredString(block.text, "Text blocks need text");
		if (!isRecord(block.typography)) {
			throw new Error("Text blocks need typography");
		}
		assertOnlyKeys(
			block.typography,
			["fontFamily", "fontSize", "fontWeight", "color", "align"],
			"typography",
		);
		requiredString(block.typography.fontFamily, "Typography needs a font family");
		const fontSize = finiteNumber(block.typography.fontSize, "Typography needs a font size");
		if (fontSize <= 0) {
			throw new Error("Typography font size must be positive");
		}
		const fontWeight = positiveInteger(
			block.typography.fontWeight,
			"Typography font weight must be a positive integer",
		);
		if (fontWeight > 1_000) {
			throw new Error("Typography font weight must not exceed 1000");
		}
		requiredString(block.typography.color, "Typography needs a color");
		if (
			block.typography.align !== "left" &&
			block.typography.align !== "center" &&
			block.typography.align !== "right"
		) {
			throw new Error(`Unsupported text alignment '${String(block.typography.align)}'`);
		}
		return id;
	}
	if (block.kind === "image" || block.kind === "video") {
		assertOnlyKeys(
			block,
			block.kind === "image"
				? [
						"id",
						"kind",
						"opacity",
						"placement",
						"continuityKey",
						"assetId",
						"fit",
						"focalPoint",
						"borderRadius",
					]
				: [
						"id",
						"kind",
						"opacity",
						"placement",
						"continuityKey",
						"assetId",
						"fit",
						"focalPoint",
						"borderRadius",
						"trim",
						"playbackRate",
						"muted",
					],
			`${block.kind} block`,
		);
		const assetId = requiredString(block.assetId, `${block.kind} blocks need an asset id`);
		const asset = assets.get(assetId);
		if (asset?.kind !== block.kind) {
			throw new Error(`Block '${id}' references missing asset '${assetId}'`);
		}
		if (block.fit !== "cover" && block.fit !== "contain") {
			throw new Error(`Unsupported media fit '${String(block.fit)}'`);
		}
		if (!isRecord(block.focalPoint)) {
			throw new Error("Media focal point must be an object");
		}
		assertOnlyKeys(block.focalPoint, ["x", "y"], "media focal point");
		assertUnit(block.focalPoint.x, "Media focal point x");
		assertUnit(block.focalPoint.y, "Media focal point y");
		if (block.borderRadius !== undefined) {
			const borderRadius = finiteNumber(block.borderRadius, "Media border radius must be a number");
			if (borderRadius < 0 || borderRadius > MAX_MEDIA_BORDER_RADIUS) {
				throw new Error(`Media border radius must be between 0 and ${MAX_MEDIA_BORDER_RADIUS}`);
			}
		}
		if (block.kind === "video") {
			if (asset.kind !== "video") {
				throw new Error(`Block '${id}' references missing asset '${assetId}'`);
			}
			if (!isRecord(block.trim)) {
				throw new Error("Video trim must be an object");
			}
			assertOnlyKeys(block.trim, ["startMs", "endMs"], "video trim");
			const startMs = nonNegativeInteger(
				block.trim.startMs,
				"Video trim start must be non-negative",
			);
			const endMs = positiveInteger(block.trim.endMs, "Video trim end must be positive");
			if (endMs <= startMs || (asset.durationMs !== undefined && endMs > asset.durationMs)) {
				throw new Error("Video trim must stay inside the asset duration");
			}
			const playbackRate = finiteNumber(block.playbackRate, "Video playback rate must be a number");
			if (playbackRate <= 0) {
				throw new Error("Video playback rate must be positive");
			}
			booleanValue(block.muted, "Video muted must be boolean");
		}
		return id;
	}
	throw new Error(`Unsupported block kind '${String(block.kind)}'`);
}

function validateSettings(value: Record<string, unknown>): void {
	assertOnlyKeys(
		value,
		[
			"progressStyle",
			"transitionMs",
			"transitionEasing",
			"typewriter",
			"focusZoom",
			"watermark",
			"fps",
		],
		"project settings",
	);
	if (
		value.progressStyle !== "bar" &&
		value.progressStyle !== "none" &&
		value.progressStyle !== "reels"
	) {
		throw new Error(`Unsupported progress style '${String(value.progressStyle)}'`);
	}
	if (value.transitionMs !== 400 && value.transitionMs !== 650 && value.transitionMs !== 1000) {
		throw new Error("Unsupported transition duration");
	}
	if (value.transitionEasing !== undefined && !isCubicBezier(value.transitionEasing)) {
		throw new Error("Unsupported transition easing");
	}
	booleanValue(value.typewriter, "Project typewriter setting must be boolean");
	booleanValue(value.focusZoom, "Project focus zoom setting must be boolean");
	if (value.watermark !== undefined && typeof value.watermark !== "string") {
		throw new Error("Project watermark must be a string");
	}
	if (value.fps !== undefined && !isProjectFps(value.fps)) {
		throw new Error("Unsupported frame rate");
	}
}

function assetKeys(kind: "image" | "video" | "audio"): readonly string[] {
	const common = ["id", "kind", "fileName", "mimeType", "byteSize", "checksum"];
	if (kind === "image") {
		return [...common, "width", "height"];
	}
	if (kind === "video") {
		return [...common, "width", "height", "durationMs"];
	}
	return [...common, "durationMs"];
}

function validateAsset(value: Record<string, unknown>): AssetMetadataPayload {
	const id = requiredString(value.id, "Each asset needs an id");
	if (value.kind !== "image" && value.kind !== "video" && value.kind !== "audio") {
		throw new Error(`Unsupported asset kind '${String(value.kind)}'`);
	}
	const kind = value.kind;
	assertOnlyKeys(value, assetKeys(kind), `${kind} asset`);
	const fileName = requiredString(value.fileName, "Asset file name must not be empty");
	const mimeType = requiredString(value.mimeType, "Asset MIME type must not be empty");
	if (!mimeType.startsWith(`${kind}/`)) {
		throw new Error(`${kind} asset MIME type must start with ${kind}/`);
	}
	if (mimeType.toLowerCase() === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) {
		throw new Error("SVG assets are not supported");
	}
	const byteSize = positiveInteger(value.byteSize, "Asset byte size must be a positive integer");
	const checksum = requiredString(value.checksum, "Asset checksum must not be empty");

	if (kind === "image") {
		return {
			id,
			kind,
			fileName,
			mimeType,
			byteSize,
			checksum,
			width: positiveInteger(value.width, "Image width must be a positive integer"),
			height: positiveInteger(value.height, "Image height must be a positive integer"),
		};
	}
	if (kind === "video") {
		return {
			id,
			kind,
			fileName,
			mimeType,
			byteSize,
			checksum,
			width: positiveInteger(value.width, "Video width must be a positive integer"),
			height: positiveInteger(value.height, "Video height must be a positive integer"),
			durationMs: positiveInteger(value.durationMs, "Video duration must be a positive integer"),
		};
	}
	return {
		id,
		kind,
		fileName,
		mimeType,
		byteSize,
		checksum,
		durationMs: positiveInteger(value.durationMs, "Audio duration must be a positive integer"),
	};
}

function validateV2(document: Record<string, unknown>): ProjectDocumentV2 {
	assertOnlyKeys(document, ["schemaVersion", "project"], "project document");
	if (!isRecord(document.project)) {
		throw new Error("V2 project must be an object");
	}
	const project = document.project;
	if ("audioTracks" in project) {
		throw new Error("V2 field 'audioTracks' is unsupported; use 'audioCues'");
	}
	assertOnlyKeys(
		project,
		["id", "title", "canvas", "settings", "assets", "audioCues", "scenes", "legacySource"],
		"project",
	);
	const projectId = requiredString(project.id, "V2 project needs an id");
	requiredString(project.title, "V2 project needs a title");
	if (!isRecord(project.canvas)) {
		throw new Error("V2 project needs canvas settings");
	}
	assertOnlyKeys(project.canvas, ["width", "height", "background"], "project canvas");
	if (!isDimension(project.canvas.width) || !isDimension(project.canvas.height)) {
		throw new Error("V2 canvas dimensions are invalid");
	}
	requiredString(project.canvas.background, "V2 canvas needs a background");
	if (!isRecord(project.settings)) {
		throw new Error("V2 project needs render settings");
	}
	validateSettings(project.settings);

	if (!Array.isArray(project.assets)) {
		throw new Error("V2 assets must be an array");
	}
	const ids = new Set<string>([projectId]);
	const assets = new Map<string, AssetMetadataPayload>();
	for (const rawAsset of project.assets) {
		if (!isRecord(rawAsset)) {
			throw new Error("Each asset must be an object");
		}
		const asset = validateAsset(rawAsset);
		if (ids.has(asset.id)) {
			throw new Error(`Duplicate id '${asset.id}'`);
		}
		ids.add(asset.id);
		assets.set(asset.id, asset);
	}

	if (!Array.isArray(project.scenes)) {
		throw new Error("V2 scenes must be an array");
	}
	let hasVisualBlock = false;
	for (const rawScene of project.scenes) {
		if (!isRecord(rawScene)) {
			throw new Error("Each scene must be an object");
		}
		assertOnlyKeys(rawScene, ["id", "durationMs", "blocks", "caption", "transitionOut"], "scene");
		const sceneId = requiredString(rawScene.id, "Each scene needs an id");
		if (ids.has(sceneId)) {
			throw new Error(`Duplicate id '${sceneId}'`);
		}
		ids.add(sceneId);
		positiveInteger(rawScene.durationMs, "Scene duration must be a positive integer");
		if (!Array.isArray(rawScene.blocks)) {
			throw new Error(`Scene '${sceneId}' blocks must be an array`);
		}
		hasVisualBlock ||= rawScene.blocks.length > 0;
		for (const block of rawScene.blocks) {
			const blockId = validateBlock(block, assets);
			if (ids.has(blockId)) {
				throw new Error(`Duplicate id '${blockId}'`);
			}
			ids.add(blockId);
		}
		if (rawScene.caption !== undefined) {
			if (typeof rawScene.caption !== "string") {
				throw new Error("Scene caption must be a string");
			}
			if (rawScene.caption.length > MAX_SCENE_CAPTION_LENGTH) {
				throw new Error(`Scene caption must be at most ${MAX_SCENE_CAPTION_LENGTH} characters`);
			}
		}
		if (rawScene.transitionOut !== undefined) {
			if (!isRecord(rawScene.transitionOut)) {
				throw new Error("Scene transition must be an object");
			}
			assertOnlyKeys(rawScene.transitionOut, ["kind", "durationMs"], "scene transition");
			if (
				rawScene.transitionOut.kind !== "cut" &&
				rawScene.transitionOut.kind !== "crossfade" &&
				rawScene.transitionOut.kind !== "magic-move"
			) {
				throw new Error(`Unsupported scene transition '${String(rawScene.transitionOut.kind)}'`);
			}
			const transitionDuration = nonNegativeInteger(
				rawScene.transitionOut.durationMs,
				"Scene transition duration must be non-negative",
			);
			if (rawScene.transitionOut.kind === "cut" && transitionDuration !== 0) {
				throw new Error("A cut transition must have zero duration");
			}
			if (rawScene.transitionOut.kind !== "cut" && transitionDuration === 0) {
				throw new Error("Animated transition duration must be positive");
			}
		}
	}

	if (!Array.isArray(project.audioCues)) {
		throw new Error("V2 audioCues must be an array");
	}
	for (const rawCue of project.audioCues) {
		if (!isRecord(rawCue)) {
			throw new Error("Each audio cue must be an object");
		}
		assertOnlyKeys(
			rawCue,
			["id", "assetId", "startMs", "trim", "gain", "fadeInMs", "fadeOutMs"],
			"audio cue",
		);
		const cueId = requiredString(rawCue.id, "Each audio cue needs an id");
		if (ids.has(cueId)) {
			throw new Error(`Duplicate id '${cueId}'`);
		}
		ids.add(cueId);
		const assetId = requiredString(rawCue.assetId, "Audio cues need an asset id");
		const asset = assets.get(assetId);
		if (asset?.kind !== "audio" || asset.durationMs === undefined) {
			throw new Error(`Audio cue '${cueId}' references missing asset '${assetId}'`);
		}
		const startMs = nonNegativeInteger(rawCue.startMs, "Audio cue start must be non-negative");
		if (!isRecord(rawCue.trim)) {
			throw new Error("Audio cue trim must be an object");
		}
		assertOnlyKeys(rawCue.trim, ["startMs", "endMs"], "audio cue trim");
		const trimStartMs = nonNegativeInteger(
			rawCue.trim.startMs,
			"Audio cue trim start must be non-negative",
		);
		const trimEndMs = positiveInteger(rawCue.trim.endMs, "Audio cue trim end must be positive");
		if (trimEndMs <= trimStartMs || trimEndMs > asset.durationMs) {
			throw new Error("Audio cue trim must stay inside the asset duration");
		}
		const gain = finiteNumber(rawCue.gain, "Audio cue gain must be a finite number");
		if (gain < 0 || gain > 1) {
			throw new Error("Audio cue gain must be between 0 and 1");
		}
		const fadeInMs = nonNegativeInteger(rawCue.fadeInMs, "Audio cue fade-in must be non-negative");
		const fadeOutMs = nonNegativeInteger(
			rawCue.fadeOutMs,
			"Audio cue fade-out must be non-negative",
		);
		if (fadeInMs + fadeOutMs > trimEndMs - trimStartMs) {
			throw new Error("Audio cue fades must fit inside its trimmed duration");
		}
		if (!Number.isSafeInteger(startMs + trimEndMs - trimStartMs)) {
			throw new Error("Audio cue end must be a safe integer");
		}
	}
	if (!hasVisualBlock && project.audioCues.length === 0) {
		throw new Error("V2 project needs a visual block or an audio cue");
	}

	if (project.legacySource !== undefined) {
		if (!isRecord(project.legacySource)) {
			throw new Error("Legacy source must be an object");
		}
		assertOnlyKeys(project.legacySource, ["liveCode", "hadCapturedSteps"], "legacy source");
		requiredString(project.legacySource.liveCode, "Legacy source code must not be empty");
		booleanValue(
			project.legacySource.hadCapturedSteps,
			"Legacy source captured-step flag must be boolean",
		);
	}
	return document as unknown as ProjectDocumentV2;
}

export function parseProjectDocument(input: unknown): ParsedProjectDocument {
	if (!isRecord(input)) {
		throw new Error("Project document must be an object");
	}
	if ("schemaVersion" in input) {
		if (input.schemaVersion !== 2) {
			throw new Error(`Unsupported project schema version '${String(input.schemaVersion)}'`);
		}
		return { schemaVersion: 2, document: validateV2(input) };
	}
	return { schemaVersion: 1, document: normalizeV1(input) };
}
