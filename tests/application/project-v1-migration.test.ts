import { migrateV1ToV2, projectV2ToV1 } from "@/application/project/migrate-v1-project";
import {
	type ProjectDocumentV1,
	parseProjectDocument,
} from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

const LEGACY: ProjectDocumentV1 = {
	title: "Release notes",
	code: "const answer = 2;",
	language: "typescript",
	themeName: "nord",
	fontFamily: "IBM Plex Mono, monospace",
	borderRadius: 16,
	background: "mesh:aurora",
	windowChrome: "terminal",
	showLineNumbers: false,
	lineNumberStart: 7,
	framePadding: 40,
	cardMargin: 48,
	watermark: "Acme",
	progressStyle: "bar",
	typewriter: true,
	focusZoom: true,
	transitionMs: 1000,
	transitionEasing: [0.25, 0.1, 0.25, 1],
	width: 1080,
	height: 1920,
	steps: [
		{ code: "const answer = 1;", duration: 900, focus: "1", caption: "Before" },
		{ code: "const answer = 2;", duration: 1300, focus: "1", caption: "After" },
	],
};

describe("migrateV1ToV2", () => {
	it("is deterministic, including every generated id", () => {
		const first = migrateV1ToV2(LEGACY);
		const second = migrateV1ToV2(LEGACY);

		expect(second).toEqual(first);
		expect(first.project.id).toMatch(/^legacy-project-/);
		expect(new Set(first.project.scenes.map((scene) => scene.id)).size).toBe(2);
	});

	it("turns every code step into a scene on one continuity track", () => {
		const migrated = migrateV1ToV2(LEGACY);
		const [first, second] = migrated.project.scenes;

		expect(migrated.schemaVersion).toBe(2);
		expect(first).toMatchObject({ durationMs: 900, caption: "Before" });
		expect(second).toMatchObject({ durationMs: 1300, caption: "After" });
		expect(first?.blocks[0]).toMatchObject({
			kind: "code",
			code: "const answer = 1;",
			language: "typescript",
			themeName: "nord",
			fontFamily: "IBM Plex Mono, monospace",
			borderRadius: 16,
			focus: "1",
			chrome: "terminal",
			showLineNumbers: false,
			lineNumberStart: 7,
			framePadding: 40,
			cardMargin: 48,
			continuityKey: "primary-code",
		});
		expect(second?.blocks[0]).toMatchObject({ continuityKey: "primary-code" });
	});

	it("preserves canvas, render settings and watermark", () => {
		const { project } = migrateV1ToV2(LEGACY);

		expect(project.canvas).toEqual({
			width: 1080,
			height: 1920,
			background: "mesh:aurora",
		});
		expect(project.settings).toMatchObject({
			progressStyle: "bar",
			transitionMs: 1000,
			transitionEasing: [0.25, 0.1, 0.25, 1],
			typewriter: true,
			focusZoom: true,
			watermark: "Acme",
		});
		expect(project.audioCues).toEqual([]);
	});

	it("turns a blank step into a scene with no code block, and refuses to roll it back", () => {
		const migrated = migrateV1ToV2({
			...LEGACY,
			steps: [{ code: "", duration: 1500, caption: "Title" }, ...LEGACY.steps],
		});
		const [title, code] = migrated.project.scenes;

		expect(title).toMatchObject({ durationMs: 1500, caption: "Title", blocks: [] });
		expect(code?.blocks[0]).toMatchObject({ kind: "code", code: "const answer = 1;" });
		expect(() => projectV2ToV1(migrated)).toThrow("only code-only V2 projects can roll back");
	});

	it("creates one static scene when the legacy project has no captured steps", () => {
		const migrated = migrateV1ToV2({ ...LEGACY, steps: [], code: "console.log('static')" });

		expect(migrated.project.scenes).toHaveLength(1);
		expect(migrated.project.scenes[0]?.blocks[0]).toMatchObject({
			kind: "code",
			code: "console.log('static')",
		});
	});

	it("round-trips a code-only project without losing authored settings", () => {
		const parsed = parseProjectDocument(LEGACY);
		if (parsed.schemaVersion !== 1) {
			throw new Error("Expected V1");
		}
		const roundTrip = projectV2ToV1(migrateV1ToV2(parsed.document));

		expect(roundTrip).toEqual(parsed.document);
	});

	it("refuses rollback when the V2 project contains non-code media", () => {
		const migrated = migrateV1ToV2(LEGACY);
		const first = migrated.project.scenes[0];
		if (!first) {
			throw new Error("Expected a scene");
		}
		const mixed = {
			...migrated,
			project: {
				...migrated.project,
				scenes: [
					{
						...first,
						blocks: [
							...first.blocks,
							{
								id: "text-overlay",
								kind: "text" as const,
								text: "overlay",
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
								typography: {
									fontFamily: "Inter",
									fontSize: 48,
									fontWeight: 600,
									color: "#fff",
									align: "center" as const,
								},
							},
						],
					},
				],
			},
		};

		expect(() => projectV2ToV1(mixed)).toThrow("only code-only V2 projects can roll back");
	});
});

describe("scene breaks (#280)", () => {
	const BROKEN: ProjectDocumentV1 = {
		...LEGACY,
		steps: [
			{ code: "const answer = 1;", duration: 900 },
			{ code: "const answer = 2;", duration: 900 },
			{ code: "export class Node {}", duration: 900, sceneBreak: true },
		],
	};

	it("stores a break as a crossfade out of the scene before, over the morph's duration", () => {
		const scenes = migrateV1ToV2(BROKEN).project.scenes;
		expect(scenes.map((scene) => scene.transitionOut)).toEqual([
			{ kind: "magic-move", durationMs: 1000 },
			{ kind: "crossfade", durationMs: 1000 },
			undefined,
		]);
	});

	it("reads the break back onto the step that opens the scene", () => {
		expect(projectV2ToV1(migrateV1ToV2(BROKEN)).steps).toEqual(BROKEN.steps);
	});

	it("opens a project file that carries a break", () => {
		const parsed = parseProjectDocument({ ...BROKEN });
		expect(parsed.schemaVersion).toBe(1);
		if (parsed.schemaVersion === 1) {
			expect(parsed.document.steps.map((step) => step.sceneBreak === true)).toEqual([
				false,
				false,
				true,
			]);
		}
	});
});
