import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import {
	STUDIO_LIVE_SCENE_ID,
	type StudioCompositionSnapshot,
	adoptStoredSceneIds,
	createStudioCompositionDocument,
	storedSceneIdsFor,
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

	it("writes a scene break as a crossfade out of the scene before it on every sync (#280)", () => {
		const scenes = [
			{ id: "a", code: "const a = 1;", durationMs: 1_000 },
			{ id: "b", code: "const b = 2;", durationMs: 1_000 },
			{ id: "c", code: "export class C {}", durationMs: 1_000, sceneBreak: true as const },
		];
		const base = hydrateProjectDocument(createStudioCompositionDocument(snapshot(scenes))).project;
		const synced = synchronizeStudioComposition(base, snapshot(scenes));
		expect(synced.scenes.map((scene) => scene.transitionOut)).toEqual([
			{ kind: "magic-move", durationMs: 650 },
			{ kind: "crossfade", durationMs: 650 },
			undefined,
		]);
		// Dropping the break turns the crossfade back into a morph.
		const merged = synchronizeStudioComposition(
			synced,
			snapshot(scenes.map(({ sceneBreak: _break, ...scene }) => scene)),
		);
		expect(merged.scenes[1]?.transitionOut?.kind).toBe("magic-move");
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

	it("hands the stored ids to live scenes of identical code, and only to those", () => {
		const stored = createStudioCompositionDocument(
			snapshot([
				{ id: "kept-one", code: "one", durationMs: 1_000 },
				{ id: "kept-two", code: "two", durationMs: 1_000 },
			]),
		);

		const ids = storedSceneIdsFor(stored, [
			{ id: "minted-one", code: "one", durationMs: 1_000 },
			{ id: "minted-two", code: "edited two", durationMs: 1_000 },
			{ id: "minted-three", code: "three", durationMs: 1_000 },
		]);

		expect(ids).toEqual(["kept-one", "minted-two", "minted-three"]);
	});

	describe("a blank scene (no code card)", () => {
		it("is created with no block at all, beside a code scene", () => {
			const document = createStudioCompositionDocument(
				snapshot([
					{ id: "title", code: "", durationMs: 1_500, caption: "Launch" },
					{ id: "code", code: "const a = 1;", durationMs: 1_000 },
				]),
			);

			expect(document.project.scenes[0]).toMatchObject({ id: "title", caption: "Launch" });
			expect(document.project.scenes[0]?.blocks).toEqual([]);
			expect(document.project.scenes[1]?.blocks.map((block) => block.kind)).toEqual(["code"]);
		});

		it("ends a project, or is all of it, without inventing live code", () => {
			const trailing = createStudioCompositionDocument(
				snapshot([
					{ id: "code", code: "const a = 1;", durationMs: 1_000 },
					{ id: "outro", code: "", durationMs: 1_500 },
				]),
			);
			expect(trailing.project.legacySource).toEqual({
				liveCode: "const a = 1;",
				hadCapturedSteps: true,
			});

			const textOnly = createStudioCompositionDocument(
				snapshot([{ id: "title", code: "", durationMs: 1_500 }]),
			);
			expect(textOnly.project.legacySource).toBeUndefined();
		});

		it("starts as a title card when nothing else in the project is visible", () => {
			// A project needs a visual block or an audio cue: a lone bare blank
			// scene takes the text layer "Add text" would create.
			const created = createStudioCompositionDocument(
				snapshot([
					{ id: "title", code: "", durationMs: 1_500 },
					{ id: "pause", code: "", durationMs: 1_000 },
				]),
			);
			expect(created.project.scenes[0]?.blocks).toMatchObject([
				{ kind: "text", text: "Add your text" },
			]);
			expect(created.project.scenes[1]?.blocks).toEqual([]);

			const live = hydrateProjectDocument(
				createStudioCompositionDocument(
					snapshot([{ id: STUDIO_LIVE_SCENE_ID, code: "live", durationMs: 3_000 }]),
				),
			).project;
			const blankFirst = synchronizeStudioComposition(
				live,
				snapshot([{ id: "title", code: "", durationMs: 1_500 }]),
			);
			expect(blankFirst.scenes[0]?.blocks.map((block) => block.kind)).toEqual(["text"]);

			// Deleting the last code scene leaves a bare blank one: it becomes the title.
			const twoScenes = hydrateProjectDocument(
				createStudioCompositionDocument(
					snapshot([
						{ id: "code", code: "one", durationMs: 1_000 },
						{ id: "outro", code: "", durationMs: 1_000 },
					]),
				),
			).project;
			const outroOnly = synchronizeStudioComposition(
				twoScenes,
				snapshot([{ id: "outro", code: "", durationMs: 1_000 }]),
			);
			expect(outroOnly.scenes.map((scene) => scene.blocks.map((block) => block.kind))).toEqual([
				["text"],
			]);
		});

		it("is continued only by its own kind: a title is not carried over code", () => {
			const hydrated = hydrateProjectDocument(
				createStudioCompositionDocument(snapshot([{ id: "title", code: "", durationMs: 1_500 }])),
			);
			const titled = hydrated.project;

			const next = synchronizeStudioComposition(
				titled,
				snapshot([
					{ id: "title", code: "", durationMs: 1_500 },
					{ id: "code", code: "const a = 1;", durationMs: 1_000 },
					{ id: "title-copy", code: "", durationMs: 1_000 },
				]),
			);
			const kinds = next.scenes.map((scene) => scene.blocks.map((block) => block.kind));
			// The code scene starts with its card only; a blank after it starts bare.
			expect(kinds).toEqual([["text"], ["code"], []]);

			// A blank right after a blank (a duplicated title card) keeps the title.
			const duplicated = synchronizeStudioComposition(
				titled,
				snapshot([
					{ id: "title", code: "", durationMs: 1_500 },
					{ id: "title-copy", code: "", durationMs: 1_500 },
				]),
			);
			expect(duplicated.scenes[1]?.blocks.map((block) => block.kind)).toEqual(["text"]);
		});

		it("keeps its text layer and gains no card when the snapshot syncs", () => {
			const hydrated = hydrateProjectDocument(
				createStudioCompositionDocument(
					snapshot([
						{ id: "title", code: "", durationMs: 1_500 },
						{ id: "code", code: "const a = 1;", durationMs: 1_000 },
					]),
				),
			);
			const titled = addTextLayer(hydrated.project, "title", { id: "headline", text: "Ship it" });

			const next = synchronizeStudioComposition(
				titled,
				snapshot([
					{ id: "title", code: "", durationMs: 2_000 },
					{ id: "code", code: "const a = 2;", durationMs: 1_000 },
				]),
			);

			expect(next.scenes[0]?.durationMs).toBe(2_000);
			expect(next.scenes[0]?.blocks.map((block) => [block.kind, block.id])).toEqual([
				["text", "headline"],
			]);
			expect(next.scenes[1]?.blocks.find((block) => block.kind === "code")).toMatchObject({
				code: "const a = 2;",
			});
		});

		it("drops the card from the live scene when the first scene added is blank", () => {
			const hydrated = hydrateProjectDocument(
				createStudioCompositionDocument(
					snapshot([{ id: STUDIO_LIVE_SCENE_ID, code: "live", durationMs: 3_000 }]),
				),
			);
			const titled = addTextLayer(hydrated.project, STUDIO_LIVE_SCENE_ID, {
				id: "headline",
				text: "Ship it",
			});

			const next = synchronizeStudioComposition(
				titled,
				snapshot([{ id: "title", code: "", durationMs: 1_500 }]),
			);

			expect(next.scenes[0]?.blocks.map((block) => block.kind)).toEqual(["text"]);
		});

		it("keeps its layers across a reload that re-mints the step ids", () => {
			const saved = hydrateProjectDocument(
				createStudioCompositionDocument(
					snapshot([
						{ id: "old-title", code: "", durationMs: 1_500 },
						{ id: "old-code", code: "one", durationMs: 1_000 },
					]),
				),
			);
			const stored = serializeProjectDocument({
				...saved,
				project: addTextLayer(saved.project, "old-title", { id: "headline", text: "Ship it" }),
			});
			const live = snapshot([
				{ id: "new-title", code: "", durationMs: 1_500 },
				{ id: "new-code", code: "one", durationMs: 1_000 },
			]);

			expect(storedSceneIdsFor(stored, live.scenes)).toEqual(["old-title", "old-code"]);
			const adopted = adoptStoredSceneIds(stored, live);
			expect(adopted.project.scenes.map((scene) => scene.id)).toEqual(["new-title", "new-code"]);
			// A code scene is not a blank one: the stored title stays off it.
			expect(
				storedSceneIdsFor(stored, [
					{ id: "new-title", code: "one", durationMs: 1_500 },
					{ id: "new-code", code: "", durationMs: 1_000 },
				]),
			).toEqual(["new-title", "new-code"]);
		});
	});
});
