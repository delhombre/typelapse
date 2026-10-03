import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import {
	STUDIO_LIVE_SCENE_ID,
	type StudioCompositionSnapshot,
	adoptStoredSceneIds,
	createStudioCompositionDocument,
	studioCompositionTimeMs,
	studioSceneLayerKinds,
	synchronizeStudioComposition,
} from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { describe, expect, it } from "vitest";

function snapshot(
	scenes: StudioCompositionSnapshot["scenes"] = [
		{
			id: "scene-one",
			code: "const first = true;",
			durationMs: 1_400,
			caption: "First beat",
			focus: "1",
		},
	],
): StudioCompositionSnapshot {
	return {
		projectId: "project-one",
		title: "Demo",
		language: "typescript",
		themeName: "midnight",
		fontFamily: "JetBrains Mono",
		borderRadius: 12,
		background: "mesh:ember",
		windowChrome: "macos",
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		canvas: { width: 1920, height: 1080 },
		transitionMs: 650,
		transitionEasing: [0.76, 0, 0.24, 1],
		typewriter: false,
		focusZoom: true,
		progressStyle: "reels",
		watermark: "",
		scenes,
	};
}

describe("studio composition synchronization", () => {
	it("maps holds and transitions onto the shared composition clock", () => {
		const scenes = [{ durationMs: 1_000 }, { durationMs: 2_000 }, { durationMs: 1_500 }];
		expect(studioCompositionTimeMs(scenes, 650, 1, null)).toBe(1_650);
		expect(studioCompositionTimeMs(scenes, 650, 1, { phase: "hold", index: 1, t: 0.25 })).toBe(
			2_150,
		);
		expect(studioCompositionTimeMs(scenes, 650, 1, { phase: "transition", index: 1, t: 0.5 })).toBe(
			3_975,
		);
	});

	it("creates a code-only V2 document without changing the accepted scene model", () => {
		const document = createStudioCompositionDocument(snapshot());

		expect(document.project.scenes).toHaveLength(1);
		expect(document.project.scenes[0]).toMatchObject({
			id: "scene-one",
			durationMs: 1_400,
			caption: "First beat",
		});
		expect(document.project.scenes[0]?.blocks).toEqual([
			expect.objectContaining({
				kind: "code",
				code: "const first = true;",
				continuityKey: "primary-code",
			}),
		]);
	});

	it("uses one stable live scene before the first capture", () => {
		const document = createStudioCompositionDocument(
			snapshot([
				{
					id: STUDIO_LIVE_SCENE_ID,
					code: "const live = true;",
					durationMs: 3_000,
				},
			]),
		);

		expect(document.project.scenes[0]?.id).toBe(STUDIO_LIVE_SCENE_ID);
	});

	it("preserves authored layers while code, timing and scene order change", () => {
		const hydrated = hydrateProjectDocument(
			createStudioCompositionDocument(
				snapshot([
					{ id: "scene-one", code: "one", durationMs: 1_000 },
					{ id: "scene-two", code: "two", durationMs: 1_200 },
				]),
			),
		);
		const withText = addTextLayer(hydrated.project, "scene-one", {
			id: "scene-one-title",
			text: "A real title",
		});

		const next = synchronizeStudioComposition(
			withText,
			snapshot([
				{ id: "scene-two", code: "two updated", durationMs: 1_500 },
				{ id: "scene-one", code: "one updated", durationMs: 900, caption: "Changed" },
			]),
		);

		expect(next.scenes.map((scene) => scene.id)).toEqual(["scene-two", "scene-one"]);
		const sceneOne = next.scenes[1];
		expect(sceneOne?.durationMs).toBe(900);
		expect(sceneOne?.caption).toBe("Changed");
		expect(sceneOne?.blocks.map((block) => block.kind)).toEqual(["code", "text"]);
		expect(sceneOne?.blocks.find((block) => block.kind === "text")).toMatchObject({
			id: "scene-one-title",
			text: "A real title",
		});
		expect(sceneOne?.blocks.find((block) => block.kind === "code")).toMatchObject({
			code: "one updated",
		});
	});

	it("carries existing layers into a newly captured scene with unique block ids", () => {
		const hydrated = hydrateProjectDocument(
			createStudioCompositionDocument(
				snapshot([{ id: "scene-one", code: "one", durationMs: 1_000 }]),
			),
		);
		const withText = addTextLayer(hydrated.project, "scene-one", {
			id: "scene-one-title",
			text: "Persistent title",
		});

		const next = synchronizeStudioComposition(
			withText,
			snapshot([
				{ id: "scene-one", code: "one", durationMs: 1_000 },
				{ id: "scene-two", code: "two", durationMs: 1_000 },
			]),
		);

		const firstText = next.scenes[0]?.blocks.find((block) => block.kind === "text");
		const secondText = next.scenes[1]?.blocks.find((block) => block.kind === "text");
		expect(secondText).toMatchObject({ kind: "text", text: "Persistent title" });
		expect(secondText?.id).not.toBe(firstText?.id);
	});

	it("summarizes only the authored capabilities that belong to each Studio scene", () => {
		const hydrated = hydrateProjectDocument(
			createStudioCompositionDocument(
				snapshot([
					{ id: "scene-one", code: "one", durationMs: 1_000 },
					{ id: "scene-two", code: "two", durationMs: 1_200 },
				]),
			),
		);
		const withText = addTextLayer(hydrated.project, "scene-one", {
			id: "scene-one-title",
			text: "A real title",
		});
		const withAudio = addMediaAsset(
			withText,
			"scene-two",
			Asset.create({
				id: "soundtrack",
				kind: "audio",
				fileName: "beat.wav",
				mimeType: "audio/wav",
				byteSize: 42,
				checksum: "sha256-beat",
				durationMs: 600,
			}),
			{ cueId: "soundtrack-cue", startMs: 1_650 },
		);

		expect(studioSceneLayerKinds(withAudio, "scene-one")).toEqual(["text"]);
		expect(studioSceneLayerKinds(withAudio, "scene-two")).toEqual(["audio"]);
	});

	it("keeps authored layers across a reload that re-mints the step ids", () => {
		// Last session: two captured scenes, a title on the second one, autosaved.
		const saved = hydrateProjectDocument(
			createStudioCompositionDocument(
				snapshot([
					{ id: "old-one", code: "one", durationMs: 1_000 },
					{ id: "old-two", code: "two", durationMs: 2_000 },
				]),
			),
		);
		const stored = serializeProjectDocument({
			...saved,
			project: addTextLayer(saved.project, "old-two", { id: "title", text: "Persist me" }),
		});
		// This session: the draft restore created the same steps under new ids.
		const live = snapshot([
			{ id: "new-one", code: "one", durationMs: 1_000 },
			{ id: "new-two", code: "two", durationMs: 2_000 },
		]);

		const adopted = adoptStoredSceneIds(stored, live);
		const next = synchronizeStudioComposition(hydrateProjectDocument(adopted).project, live);

		expect(next.scenes.map((scene) => scene.id)).toEqual(["new-one", "new-two"]);
		expect(studioSceneLayerKinds(next, "new-two")).toEqual(["text"]);
		expect(next.scenes[1]?.blocks.find((block) => block.kind === "text")).toMatchObject({
			id: "title",
			text: "Persist me",
		});
	});

	it("does not hand a stored layer to a scene whose code differs", () => {
		const saved = hydrateProjectDocument(
			createStudioCompositionDocument(
				snapshot([{ id: "old-one", code: "one", durationMs: 1_000 }]),
			),
		);
		const stored = serializeProjectDocument({
			...saved,
			project: addTextLayer(saved.project, "old-one", { id: "title", text: "Other project" }),
		});

		const adopted = adoptStoredSceneIds(
			stored,
			snapshot([{ id: "imported", code: "imported code", durationMs: 1_000 }]),
		);

		expect(adopted).toBe(stored);
	});
});
