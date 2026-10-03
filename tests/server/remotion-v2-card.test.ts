import { describe, expect, it } from "vitest";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import { proofDocument } from "./remotion-v2-proof-document";

describe("Remotion V2 code card", () => {
	it("reads the studio's card off the document: every scene's code, the first card's look", async () => {
		const card = await buildCodeCardInput({ document: proofDocument(), loop: false });

		expect(card).toMatchObject({
			title: "greet.ts",
			language: "typescript",
			// The snippet the studio opens: midnight's factory, the block's font and radius.
			theme: {
				name: "midnight",
				background: "#0d1117",
				foreground: "#e6edf3",
				fontFamily: "JetBrains Mono, monospace",
				fontSize: 14,
				borderRadius: 12,
			},
			background: "mesh:aurora",
			windowChrome: "macos",
			showLineNumbers: true,
			lineNumberStart: 1,
			framePadding: 24,
			cardMargin: 32,
			transitionMs: 1000,
			loop: false,
			typewriter: false,
			focusZoom: false,
			progressStyle: "none",
			watermark: "@typelapse",
		});
		expect(card?.steps.map((step) => step.duration)).toEqual([1500, 1500, 1500]);
		expect(card?.steps[2]?.code).toBe("export const greet = (name: string) =>\n  `Hello, ${name}`;");
		// The magic move is laid out here, one frame per scene and a morph between each pair.
		expect(card?.plan.frames).toHaveLength(3);
		expect(card?.plan.transitions).toHaveLength(2);
		expect(card?.plan.loopTransition).toBeUndefined();
	});

	it("plans the loop morph, carries focus and captions, and has no card without code", async () => {
		const base = proofDocument();
		const [title, image, code] = base.project.scenes;
		if (!title || !image || !code) {
			throw new Error("the proof project lost a scene");
		}
		const card = await buildCodeCardInput({
			document: {
				...base,
				project: {
					...base.project,
					scenes: [
						{ ...title, caption: "Say hello" },
						{
							...image,
							blocks: image.blocks.map((block) =>
								block.kind === "code" ? { ...block, focus: "2-3" } : block,
							),
						},
						code,
					],
				},
			},
			loop: true,
		});
		expect(card?.loop).toBe(true);
		expect(card?.plan.loopTransition).toBeDefined();
		expect(card?.steps[0]?.caption).toBe("Say hello");
		expect(card?.steps[1]?.focus).toEqual([2, 3]);
		expect(card?.steps[2]?.focus).toBeUndefined();

		const noCode = await buildCodeCardInput({
			document: {
				...base,
				project: {
					...base.project,
					scenes: [title, image, code].map((scene) => ({
						...scene,
						blocks: scene.blocks.filter((block) => block.kind !== "code"),
					})),
				},
			},
			loop: false,
		});
		expect(noCode).toBeNull();
	});

	it("keeps the card on a mixed project: a blank scene holds its neighbour's code", async () => {
		const base = proofDocument();
		const [title, image, code] = base.project.scenes;
		if (!title || !image || !code) {
			throw new Error("the proof project lost a scene");
		}
		const card = await buildCodeCardInput({
			document: {
				...base,
				project: {
					...base.project,
					scenes: [
						{ ...title, blocks: title.blocks.filter((block) => block.kind !== "code") },
						image,
						code,
					],
				},
			},
			loop: false,
		});

		// The studio's `morphCodes`: the title card holds scene 2's code, so the card
		// fades in in place instead of morphing out of an empty window.
		const imageCode = image.blocks.find((block) => block.kind === "code");
		expect(card?.steps.map((step) => step.code)).toEqual([
			imageCode?.kind === "code" ? imageCode.code : "",
			imageCode?.kind === "code" ? imageCode.code : "",
			"export const greet = (name: string) =>\n  `Hello, ${name}`;",
		]);
		expect(card?.steps.map((step) => step.duration)).toEqual([1500, 1500, 1500]);
		expect(card?.plan.frames).toHaveLength(3);
		expect(card?.theme.name).toBe("midnight");
	});
});
