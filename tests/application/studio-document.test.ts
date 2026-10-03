import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV1 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import {
	STUDIO_LIVE_SCENE_ID,
	type StudioCompositionSnapshot,
	createStudioCompositionDocument,
} from "@/application/project/studio-composition";
import { openStudioDocument, studioProjectDocument } from "@/application/project/studio-document";
import { Asset } from "@/domain/entities/asset";
import { describe, expect, it } from "vitest";

/**
 * The studio's project file is the V2 document. Opening one hands the studio
 * two things: the document itself (layers, assets, audio cues) and the code
 * spine the editor and the magic move run on, with each step keyed by its scene
 * so the layers above it stay attached.
 */

const V1: ProjectDocumentV1 = {
	title: "Spine",
	code: "const c = 3;",
	language: "typescript",
	themeName: "nord",
	background: "mesh:ocean",
	transitionMs: 400,
	typewriter: true,
	steps: [
		{ code: "const a = 1;", duration: 1200, caption: "First" },
		{ code: "const b = 2;", duration: 900, focus: "1" },
		{ code: "const c = 3;", duration: 1500 },
	],
};

function snapshot(
	scenes: StudioCompositionSnapshot["scenes"],
	overrides: Partial<StudioCompositionSnapshot> = {},
): StudioCompositionSnapshot {
	return {
		projectId: "slot-1",
		title: "Layers",
		language: "typescript",
		themeName: "midnight",
		fontFamily: "JetBrains Mono",
		borderRadius: 12,
		background: "mesh:solar",
		windowChrome: "macos",
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		canvas: { width: 1080, height: 1920 },
		transitionMs: 650,
		transitionEasing: [0.76, 0, 0.24, 1],
		typewriter: false,
		focusZoom: true,
		progressStyle: "bar",
		watermark: "@me",
		scenes,
		...overrides,
	};
}

function layeredDocument() {
	const base = createStudioCompositionDocument(
		snapshot([
			{ id: "scene-a", code: "const a = 1;", durationMs: 1000 },
			{ id: "scene-b", code: "const b = 2;", durationMs: 2000, caption: "Two" },
		]),
	);
	const hydrated = hydrateProjectDocument(base);
	const image = Asset.create({
		id: "image-1",
		kind: "image",
		fileName: "still.png",
		mimeType: "image/png",
		byteSize: 4,
		checksum: "a".repeat(64),
		width: 640,
		height: 360,
	});
	let project = addMediaAsset(hydrated.project, "scene-a", image, { blockId: "image-block" });
	project = addTextLayer(project, "scene-b", { id: "text-1", text: "Hello" });
	return serializeProjectDocument({ ...hydrated, project });
}

describe("openStudioDocument", () => {
	it("migrates a V1 file with the legacy ids, so the same file always opens with the same ids", () => {
		const first = openStudioDocument(JSON.parse(JSON.stringify(V1)));
		const second = openStudioDocument(JSON.parse(JSON.stringify(V1)));

		expect(first.document.project.scenes.map((scene) => scene.id)).toEqual(
			second.document.project.scenes.map((scene) => scene.id),
		);
		expect(first.spine.steps.map((step) => step.id)).toEqual(
			first.document.project.scenes.map((scene) => scene.id),
		);
		expect(first.spine.steps.map((step) => step.id)).toEqual(
			second.spine.steps.map((step) => step.id),
		);
		expect(first.spine.steps[0]).toMatchObject({ code: "const a = 1;", caption: "First" });
		expect(first.spine.transitionMs).toBe(400);
		expect(first.spine.typewriter).toBe(true);
	});

	it("gives docs/demo.project.json the same scene and step ids on every open", () => {
		const raw = readFileSync(resolve(__dirname, "../../docs/demo.project.json"), "utf8");
		const a = openStudioDocument(JSON.parse(raw));
		const b = openStudioDocument(JSON.parse(raw));

		expect(a.spine.steps.length).toBeGreaterThan(1);
		expect(a.spine.steps.map((step) => step.id)).toEqual(b.spine.steps.map((step) => step.id));
		expect(a.document).toEqual(b.document);
	});

	it("opens a V2 document with media and text layers instead of refusing it", () => {
		const document = layeredDocument();

		const opened = openStudioDocument(JSON.parse(JSON.stringify(document)));

		expect(opened.document).toEqual(document);
		expect(opened.spine.steps.map((step) => step.id)).toEqual(["scene-a", "scene-b"]);
		expect(opened.spine.steps.map((step) => step.code)).toEqual(["const a = 1;", "const b = 2;"]);
		expect(opened.spine.steps[1]?.caption).toBe("Two");
		expect(opened.spine).toMatchObject({
			title: "Layers",
			background: "mesh:solar",
			width: 1080,
			height: 1920,
			progressStyle: "bar",
			watermark: "@me",
			focusZoom: true,
			fontFamily: "JetBrains Mono",
			borderRadius: 12,
		});
	});

	it("opens a V2 live-code project without inventing captured steps", () => {
		const document = createStudioCompositionDocument(
			snapshot([{ id: STUDIO_LIVE_SCENE_ID, code: "const live = 1;", durationMs: 3000 }]),
		);

		const opened = openStudioDocument(document);

		expect(opened.spine.steps).toEqual([]);
		expect(opened.spine.code).toBe("const live = 1;");
	});

	it("opens a scene without a code layer as a blank step, its layers attached", () => {
		const document = layeredDocument();
		const scenes = document.project.scenes.map((scene, index) =>
			index === 1
				? { ...scene, blocks: scene.blocks.filter((block) => block.kind !== "code") }
				: scene,
		);
		const titled = { ...document, project: { ...document.project, scenes } };

		const opened = openStudioDocument(JSON.parse(JSON.stringify(titled)));

		expect(opened.document).toEqual(titled);
		expect(opened.spine.steps.map((step) => step.id)).toEqual(["scene-a", "scene-b"]);
		expect(opened.spine.steps.map((step) => step.code)).toEqual(["const a = 1;", ""]);
		expect(opened.spine.steps[1]?.caption).toBe("Two");
	});

	it("opens a text-only V2 file that has no code anywhere", () => {
		const document = layeredDocument();
		const scenes = document.project.scenes.map((scene) => ({
			...scene,
			blocks: scene.blocks.filter((block) => block.kind === "text"),
		}));
		const { legacySource: _legacy, ...project } = document.project;
		const textOnly = { ...document, project: { ...project, assets: [], scenes } };

		const opened = openStudioDocument(JSON.parse(JSON.stringify(textOnly)));

		expect(opened.spine.steps.map((step) => step.code)).toEqual(["", ""]);
		// The editor still holds something to capture next.
		expect(opened.spine.code.trim()).not.toBe("");
		expect(opened.spine.language).toBe("typescript");
		expect(opened.spine.themeName).toBe("midnight");
	});

	it("still refuses a V2 file whose aggregate is invalid before anything is loaded", () => {
		const document = layeredDocument();
		const scenes = document.project.scenes.map((scene) => ({ ...scene, durationMs: -1 }));

		expect(() =>
			openStudioDocument({ ...document, project: { ...document.project, scenes } }),
		).toThrow();
	});
});

describe("studioProjectDocument", () => {
	it("writes the studio's current settings and live code into the document it saves", () => {
		const stale = layeredDocument();
		const live = snapshot(
			[
				{ id: "scene-a", code: "const a = 1;", durationMs: 1000 },
				{ id: "scene-b", code: "const b = 2;", durationMs: 2000, caption: "Two" },
			],
			{ transitionMs: 1000, typewriter: true, progressStyle: "none", watermark: "" },
		);

		const document = studioProjectDocument(stale, live, "const editing = 1;");

		expect(document.project.settings).toEqual({
			progressStyle: "none",
			transitionMs: 1000,
			transitionEasing: [0.76, 0, 0.24, 1],
			typewriter: true,
			focusZoom: true,
			watermark: "",
		});
		expect(document.project.legacySource).toEqual({
			liveCode: "const editing = 1;",
			hadCapturedSteps: true,
		});
		expect(document.project.assets).toEqual(stale.project.assets);
		expect(document.project.scenes).toEqual(stale.project.scenes);
	});

	it("keeps a valid live code when the editor is blank", () => {
		const document = studioProjectDocument(
			layeredDocument(),
			snapshot([
				{ id: "scene-a", code: "const a = 1;", durationMs: 1000 },
				{ id: "scene-b", code: "const b = 2;", durationMs: 2000 },
			]),
			"   ",
		);

		expect(document.project.legacySource?.liveCode).toBe("const b = 2;");
	});

	it("round-trips a title card before a code scene through the project file", () => {
		const live = snapshot([
			{ id: "title", code: "", durationMs: 1500, caption: "Launch" },
			{ id: "code", code: "const a = 1;", durationMs: 2000 },
		]);
		const composed = hydrateProjectDocument(createStudioCompositionDocument(live));
		const project = addTextLayer(composed.project, "title", { id: "title-text", text: "Ship it" });
		const saved = studioProjectDocument(
			serializeProjectDocument({ ...composed, project }),
			live,
			"   ",
		);

		expect(saved.project.scenes[0]?.blocks.map((block) => block.kind)).toEqual(["text"]);
		expect(saved.project.legacySource?.liveCode).toBe("const a = 1;");

		const reopened = openStudioDocument(JSON.parse(JSON.stringify(saved)));
		expect(reopened.document).toEqual(saved);
		expect(reopened.spine.steps.map((step) => [step.id, step.code])).toEqual([
			["title", ""],
			["code", "const a = 1;"],
		]);
		expect(reopened.spine.steps[0]?.caption).toBe("Launch");
	});
});
