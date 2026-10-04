import { migrateV1ToV2, projectV2ToV1 } from "@/application/project/migrate-v1-project";
import {
	type ProjectDocumentV1,
	parseProjectDocument,
} from "@/application/project/project-document";
import {
	type StudioCompositionSnapshot,
	createStudioCompositionDocument,
} from "@/application/project/studio-composition";
import { openStudioDocument, studioProjectDocument } from "@/application/project/studio-document";
import { describe, expect, it } from "vitest";

/** The frame rate chosen in the export panel travels with the project file. */

const V1: ProjectDocumentV1 = {
	title: "Rate",
	code: "const a = 1;",
	language: "typescript",
	themeName: "nord",
	background: "mesh:ocean",
	fps: 24,
	steps: [{ code: "const a = 1;", duration: 1000 }],
};

const SNAPSHOT: StudioCompositionSnapshot = {
	projectId: "rate",
	title: "Rate",
	language: "typescript",
	themeName: "nord",
	fontFamily: "JetBrains Mono",
	borderRadius: 12,
	background: "mesh:ocean",
	windowChrome: "macos",
	showLineNumbers: true,
	lineNumberStart: 1,
	framePadding: 24,
	cardMargin: 48,
	canvas: { width: 1920, height: 1080 },
	transitionMs: 650,
	transitionEasing: [0.4, 0, 0.2, 1],
	typewriter: false,
	focusZoom: false,
	progressStyle: "reels",
	watermark: "",
	fps: 30,
	scenes: [{ id: "scene-1", code: "const a = 1;", durationMs: 1000 }],
};

describe("the project file's frame rate", () => {
	it("survives the V1 reader, and a rate the panel does not offer is dropped", () => {
		const read = parseProjectDocument(V1);
		expect(read.schemaVersion === 1 && read.document.fps).toBe(24);

		const odd = parseProjectDocument({ ...V1, fps: 25 });
		expect(odd.schemaVersion === 1 && odd.document.fps).toBeUndefined();
	});

	it("migrates both ways between V1 and V2", () => {
		const v2 = migrateV1ToV2(V1);
		expect(v2.project.settings.fps).toBe(24);
		expect(projectV2ToV1(v2).fps).toBe(24);
	});

	it("is validated in a V2 document", () => {
		const v2 = migrateV1ToV2(V1);
		expect(() => parseProjectDocument(v2)).not.toThrow();
		expect(() =>
			parseProjectDocument({
				...v2,
				project: { ...v2.project, settings: { ...v2.project.settings, fps: 25 } },
			}),
		).toThrow("frame rate");
	});

	it("is written by the studio's save and read back when the file opens", () => {
		const composition = createStudioCompositionDocument(SNAPSHOT);
		const saved = studioProjectDocument(composition, { ...SNAPSHOT, fps: 60 }, "const a = 1;");
		expect(saved.project.settings.fps).toBe(60);

		expect(openStudioDocument(saved).spine.fps).toBe(60);
	});

	it("stays absent from a file that never chose one", () => {
		const { fps: _fps, ...withoutRate } = SNAPSHOT;
		const saved = studioProjectDocument(
			createStudioCompositionDocument(withoutRate),
			withoutRate,
			"const a = 1;",
		);
		expect("fps" in saved.project.settings).toBe(false);
	});
});
