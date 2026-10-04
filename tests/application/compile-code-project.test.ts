import { videoScript } from "@/application/export/video-script";
import type { LaidOutToken, MagicMovePlan } from "@/application/magic-move/engine";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import type { ProjectDocumentV1 } from "@/application/project/project-document";
import { compileCodeProject } from "@/application/render/compile-project";
import { frameAt } from "@/application/render/render-program";
import { describe, expect, it } from "vitest";

function token(key: string, content: string, line: number, col: number): LaidOutToken {
	return { key, content, line, col };
}

const FRAME_A = { tokens: [token("same", "const", 0, 0)], lineCount: 1 };
const FRAME_B = {
	tokens: [token("same", "const", 0, 0), token("new", " value", 0, 5)],
	lineCount: 1,
};
const PLAN: MagicMovePlan = {
	frames: [FRAME_A, FRAME_B],
	transitions: [{ from: FRAME_A.tokens, to: FRAME_B.tokens }],
};

const V1: ProjectDocumentV1 = {
	title: "Parity",
	code: "const value",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	transitionMs: 650,
	steps: [
		{ code: "const", duration: 1000 },
		{ code: "const value", duration: 800 },
	],
};

describe("compileCodeProject", () => {
	it("wraps the existing code script without changing any boundary frame", () => {
		const document = migrateV1ToV2(V1);
		const program = compileCodeProject({ document, codePlan: PLAN, fps: 30, loop: false });
		const legacy = videoScript({
			plan: PLAN,
			durations: [1000, 800],
			transitionMs: 650,
			fps: 30,
			loop: false,
			typewriter: false,
			firstCode: "const",
			focusSets: [undefined, undefined],
		});

		expect(program.totalFrames).toBe(legacy.totalFrames);
		const boundaries = [0, 29, 30, 39, 49, 50, legacy.totalFrames - 1];
		for (const frame of boundaries) {
			const rendered = frameAt(program, frame);
			const codeLayer = rendered.layers[0];
			expect(codeLayer?.kind).toBe("code");
			if (codeLayer?.kind !== "code") {
				throw new Error("Expected code layer");
			}
			expect(codeLayer.frame).toEqual(legacy.frameAt(frame));
		}
	});

	it("locates the authored scene at holds and the destination after a transition midpoint", () => {
		const document = migrateV1ToV2(V1);
		const [first, second] = document.project.scenes;
		const program = compileCodeProject({ document, codePlan: PLAN, fps: 30, loop: false });

		expect(frameAt(program, 0).sceneId).toBe(first?.id);
		expect(frameAt(program, 35).sceneId).toBe(first?.id);
		expect(frameAt(program, 41).sceneId).toBe(second?.id);
		expect(frameAt(program, 50).sceneId).toBe(second?.id);
	});

	it("renders a single static scene", () => {
		const document = migrateV1ToV2({ ...V1, steps: [], code: "const" });
		const singlePlan: MagicMovePlan = { frames: [FRAME_A], transitions: [] };
		const program = compileCodeProject({
			document,
			codePlan: singlePlan,
			fps: 30,
			loop: false,
		});

		expect(program.totalFrames).toBe(30);
		expect(frameAt(program, 0).layers[0]).toMatchObject({
			kind: "code",
			blockId: document.project.scenes[0]?.blocks[0]?.id,
		});
	});

	it("refuses a generic media document at the code-only compiler seam", () => {
		const document = migrateV1ToV2(V1);
		const first = document.project.scenes[0];
		if (!first) {
			throw new Error("Expected a scene");
		}
		const mixed = {
			...document,
			project: {
				...document.project,
				scenes: [
					{
						...first,
						blocks: [
							...first.blocks,
							{
								id: "overlay",
								kind: "text" as const,
								text: "Not yet",
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

		expect(() =>
			compileCodeProject({ document: mixed, codePlan: PLAN, fps: 30, loop: false }),
		).toThrow("Code compiler only accepts one code block per scene");
	});
});
