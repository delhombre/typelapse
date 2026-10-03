import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { TextBlock } from "@/domain/entities/block";
import { Scene } from "@/domain/entities/scene";
import { createProjectStore } from "@/presentation/stores/project.store";
import { describe, expect, it } from "vitest";

function textDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Story",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_000,
					blocks: [
						{
							id: "title-1",
							kind: "text",
							text: "Hello",
							typography: {
								fontFamily: "Inter",
								fontSize: 72,
								fontWeight: 700,
								color: "#fff",
								align: "center",
							},
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
					],
				},
			],
		},
	};
}

function subtitle() {
	return TextBlock.create({
		id: "subtitle-1",
		text: "Images, video and sound can join too",
		placement: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 },
		typography: {
			fontFamily: "Inter",
			fontSize: 32,
			fontWeight: 500,
			color: "#ddd",
			align: "center",
		},
	});
}

describe("the multimedia project editor store", () => {
	it("selects authored scenes and serializes generic domain edits", () => {
		const store = createProjectStore(textDocument());

		expect(store.getState()).toMatchObject({
			selectedSceneId: "scene-1",
			selectedBlockId: null,
			canUndo: false,
			canRedo: false,
		});

		store.getState().transact((project) => project.addBlock("scene-1", subtitle()));
		store.getState().selectBlock("scene-1", "subtitle-1");

		expect(store.getState().toDocument().project.scenes[0]?.blocks).toHaveLength(2);
		expect(store.getState()).toMatchObject({
			selectedSceneId: "scene-1",
			selectedBlockId: "subtitle-1",
			canUndo: true,
			canRedo: false,
		});
	});

	it("supports immediate consecutive undo and redo without waiting for a toast", () => {
		const store = createProjectStore(textDocument());
		const second = Scene.create({
			id: "scene-2",
			durationMs: 1_000,
			blocks: [subtitle()],
		});
		const third = Scene.create({
			id: "scene-3",
			durationMs: 1_000,
			blocks: [TextBlock.create({ ...subtitle(), id: "subtitle-3" })],
		});
		store.getState().transact((project) => project.addScene(second));
		store.getState().transact((project) => project.addScene(third));

		store.getState().undo();
		store.getState().undo();

		expect(
			store
				.getState()
				.toDocument()
				.project.scenes.map((scene) => scene.id),
		).toEqual(["scene-1"]);
		expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true });

		store.getState().redo();
		store.getState().redo();
		expect(
			store
				.getState()
				.toDocument()
				.project.scenes.map((scene) => scene.id),
		).toEqual(["scene-1", "scene-2", "scene-3"]);
	});

	it("restores selection with history and rejects foreign block selections", () => {
		const store = createProjectStore(textDocument());
		store.getState().selectBlock("scene-1", "title-1");
		store.getState().transact((project) => project.addBlock("scene-1", subtitle()));
		store.getState().selectBlock("scene-1", "subtitle-1");

		store.getState().undo();

		expect(store.getState()).toMatchObject({
			selectedSceneId: "scene-1",
			selectedBlockId: "title-1",
		});
		expect(() => store.getState().selectBlock("scene-1", "missing")).toThrow(
			"Block missing does not belong to scene scene-1",
		);
	});

	it("does not mutate state when a domain transaction is invalid", () => {
		const store = createProjectStore(textDocument());
		const before = store.getState().toDocument();

		expect(() => store.getState().transact((project) => project.removeScene("scene-1"))).toThrow(
			"Project must contain a visual block or an audio cue",
		);

		expect(store.getState().toDocument()).toEqual(before);
		expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false });
	});

	it("loads a canonical project as a new editing session", () => {
		const store = createProjectStore(textDocument());
		store.getState().transact((project) => project.addBlock("scene-1", subtitle()));
		store.getState().selectBlock("scene-1", "subtitle-1");
		const loaded = textDocument();
		loaded.project.id = "project-2";
		loaded.project.title = "Loaded story";
		const loadedScene = loaded.project.scenes[0];
		const loadedTitle = loadedScene?.blocks[0];
		if (!loadedScene || !loadedTitle) {
			throw new Error("Fixture must contain one scene and one block");
		}
		loadedScene.id = "loaded-scene";
		loadedTitle.id = "loaded-title";

		store.getState().loadDocument(loaded);

		expect(store.getState().toDocument().project).toMatchObject({
			id: "project-2",
			title: "Loaded story",
		});
		expect(store.getState()).toMatchObject({
			selectedSceneId: "loaded-scene",
			selectedBlockId: null,
			canUndo: false,
			canRedo: false,
			past: [],
			future: [],
		});
	});

	it("synchronizes the Studio scene spine without adding or corrupting authored history", () => {
		const store = createProjectStore(textDocument());
		store.getState().transact((project) => project.addBlock("scene-1", subtitle()));

		store.getState().synchronize((project) => project.rename("Synced from Studio"));

		expect(store.getState().toDocument().project.title).toBe("Synced from Studio");
		expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

		store.getState().undo();

		expect(store.getState().toDocument().project.title).toBe("Synced from Studio");
		expect(store.getState().toDocument().project.scenes[0]?.blocks).toHaveLength(1);
	});

	it("keeps no history of its own when the surrounding studio owns it", () => {
		const store = createProjectStore(textDocument(), { history: false });
		store.getState().transact((project) => project.addBlock("scene-1", subtitle()));

		expect(store.getState()).toMatchObject({ canUndo: false, past: [] });
		store.getState().undo();
		expect(store.getState().toDocument().project.scenes[0]?.blocks).toHaveLength(2);
	});
});
