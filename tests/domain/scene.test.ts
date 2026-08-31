import { type Block, CodeBlock, TextBlock } from "@/domain/entities/block";
import { MAX_SCENE_CAPTION_LENGTH, Scene } from "@/domain/entities/scene";
import { describe, expect, it } from "vitest";

function codeBlock(id = "code-1", code = "const value = 1;") {
	return CodeBlock.create({ id, code, language: "typescript", continuityKey: "primary-code" });
}

function textBlock(id: string, text: string) {
	return TextBlock.create({
		id,
		text,
		typography: {
			fontFamily: "Inter",
			fontSize: 48,
			fontWeight: 600,
			color: "#fff",
			align: "center",
		},
	});
}

describe("Scene", () => {
	it("creates a hydrated ordered scene with caption and outgoing transition", () => {
		const code = codeBlock();
		const title = textBlock("title-1", "Before");
		const scene = Scene.create({
			id: "scene-1",
			durationMs: 1_200,
			blocks: [code, title],
			caption: "  Explain the change  ",
			transitionOut: { kind: "magic-move", durationMs: 650 },
		});

		expect(scene.id).toBe("scene-1");
		expect(scene.durationMs).toBe(1_200);
		expect(scene.blocks.map((block) => block.id)).toEqual(["code-1", "title-1"]);
		expect(scene.caption).toBe("Explain the change");
		expect(scene.transitionOut).toEqual({ kind: "magic-move", durationMs: 650 });
	});

	it("treats a blank caption as absent and permits an explicit zero-duration cut", () => {
		const scene = Scene.create({
			durationMs: 1_000,
			blocks: [codeBlock()],
			caption: "  ",
			transitionOut: { kind: "cut", durationMs: 0 },
		});

		expect(scene.id).toBeDefined();
		expect(scene.caption).toBeUndefined();
		expect(scene.transitionOut).toEqual({ kind: "cut", durationMs: 0 });
	});

	it("allows an intentionally empty visual scene", () => {
		const scene = Scene.create({ durationMs: 1_000, blocks: [] });

		expect(scene.blocks).toEqual([]);
	});

	it("rejects invalid duration and duplicate block ids", () => {
		expect(() => Scene.create({ durationMs: 0, blocks: [codeBlock()] })).toThrow(
			"Scene duration must be a positive integer",
		);
		expect(() =>
			Scene.create({ durationMs: 1_000, blocks: [codeBlock("same"), textBlock("same", "x")] }),
		).toThrow("Scene block ids must be unique");
	});

	it("bounds captions to the one rendered line", () => {
		expect(() =>
			Scene.create({
				durationMs: 1_000,
				blocks: [codeBlock()],
				caption: "a".repeat(MAX_SCENE_CAPTION_LENGTH + 1),
			}),
		).toThrow(`Scene caption must be at most ${MAX_SCENE_CAPTION_LENGTH} characters`);
	});

	it("rejects contradictory transition timing", () => {
		expect(() =>
			Scene.create({
				durationMs: 1_000,
				blocks: [codeBlock()],
				transitionOut: { kind: "cut", durationMs: 1 },
			}),
		).toThrow("A cut transition must have zero duration");
		expect(() =>
			Scene.create({
				durationMs: 1_000,
				blocks: [codeBlock()],
				transitionOut: { kind: "crossfade", durationMs: 0 },
			}),
		).toThrow("Animated transition duration must be a positive integer");
	});

	it("replaces one block immutably without changing layer order", () => {
		const originalCode = codeBlock();
		const title = textBlock("title-1", "Before");
		const scene = Scene.create({ durationMs: 1_000, blocks: [originalCode, title] });
		const replacement = codeBlock(originalCode.id, "const value = 2;");

		const updated = scene.replaceBlock(replacement);

		expect(updated).not.toBe(scene);
		expect(updated.id).toBe(scene.id);
		expect(updated.blocks.map((block) => block.id)).toEqual([originalCode.id, title.id]);
		expect(updated.blocks[0]).toBe(replacement);
		expect(scene.blocks[0]).toBe(originalCode);
		expect(() => scene.replaceBlock(codeBlock("unknown"))).toThrow(
			"Block unknown does not belong to scene",
		);
	});

	it("adds, removes and reorders mixed-media layers immutably", () => {
		const code = codeBlock();
		const title = textBlock("title-1", "Title");
		const note = textBlock("note-1", "Note");
		const scene = Scene.create({ durationMs: 1_000, blocks: [code] });

		const layered = scene.addBlock(title).addBlock(note, 1);
		const reordered = layered.reorderBlocks([title.id, code.id, note.id]);
		const removed = reordered.removeBlock(code.id);

		expect(layered.blocks.map((block) => block.id)).toEqual([code.id, note.id, title.id]);
		expect(reordered.blocks.map((block) => block.id)).toEqual([title.id, code.id, note.id]);
		expect(removed.blocks.map((block) => block.id)).toEqual([title.id, note.id]);
		expect(scene.blocks.map((block) => block.id)).toEqual([code.id]);
		expect(() => scene.addBlock(codeBlock(code.id))).toThrow("already belongs to scene");
		expect(() => scene.addBlock(title, 2)).toThrow("Block insertion index is out of bounds");
		expect(() => scene.removeBlock("missing")).toThrow("does not belong to scene");
		expect(() => layered.reorderBlocks([code.id, code.id, note.id])).toThrow(
			"Ordered block ids must be an exact permutation",
		);
	});

	it("updates authored timing, transition and caption as immutable scene values", () => {
		const scene = Scene.create({ durationMs: 1_000, blocks: [codeBlock()] });

		const updated = scene
			.withDuration(2_400)
			.withTransition({ kind: "crossfade", durationMs: 350 })
			.withCaption("  A composed scene  ");

		expect(updated.durationMs).toBe(2_400);
		expect(updated.transitionOut).toEqual({ kind: "crossfade", durationMs: 350 });
		expect(updated.caption).toBe("A composed scene");
		expect(scene.durationMs).toBe(1_000);
		expect(scene.transitionOut).toBeUndefined();
		expect(updated.withTransition(undefined).transitionOut).toBeUndefined();
		expect(() => scene.withDuration(0)).toThrow("Scene duration must be a positive integer");
	});

	it("defensively freezes blocks and transition values", () => {
		const blocks: Block[] = [codeBlock()];
		const transition = { kind: "crossfade" as const, durationMs: 300 };
		const scene = Scene.create({ durationMs: 1_000, blocks, transitionOut: transition });

		blocks.push(textBlock("late", "late"));
		transition.durationMs = 999;

		expect(scene.blocks).toHaveLength(1);
		expect(scene.transitionOut?.durationMs).toBe(300);
		expect(Object.isFrozen(scene)).toBe(true);
		expect(Object.isFrozen(scene.blocks)).toBe(true);
		expect(Object.isFrozen(scene.transitionOut)).toBe(true);
	});
});
