import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { ProjectPayload } from "@/application/project/project-payload";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { ProjectChip } from "@/presentation/components/layout/project-chip";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	activateLocalProject,
	createLocalProject,
	ensureActiveLocalProject,
	readLocalProjects,
} from "@/presentation/utils/local-project-storage";
import {
	openStudioProjectDocument,
	restoreStudioProject,
} from "@/presentation/utils/studio-project-replacement";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #82: every local project keeps its own layers, media and audio. The stored
 * composition is keyed by the local project id, and the chip saves the V2
 * document of the project it leaves before it opens the next one.
 */

const library = vi.hoisted(() => {
	const projects = new Map<string, unknown>();
	const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
	return {
		projects,
		loadProject: async (id: string) => {
			const stored = projects.get(id);
			return stored ? clone(stored) : null;
		},
		saveProject: async (document: { project: { id: string } }) => {
			projects.set(document.project.id, clone(document));
		},
		moveProject: async (from: string, to: string) => {
			const stored = projects.get(from) as { project: { id: string } } | undefined;
			if (!stored) return null;
			const moved = { ...clone(stored), project: { ...clone(stored.project), id: to } };
			projects.delete(from);
			projects.set(to, moved);
			return clone(moved);
		},
		loadAsset: async () => null,
		saveAsset: async () => undefined,
		loadCurrent: async () => null,
	};
});

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	const { BrowserObjectUrlSceneAssetSourceFactory } = await import(
		"@/infrastructure/assets/browser-local-media-importer"
	);
	return {
		studioLocalLibrary: library,
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: new BrowserObjectUrlSceneAssetSourceFactory({
			createObjectURL: () => "blob:test",
			revokeObjectURL: () => undefined,
		}),
	};
});

function payload(title: string): ProjectPayload {
	return {
		title,
		code: `const project = "${title}";`,
		language: "typescript",
		themeName: "midnight",
		background: "mesh:solar",
		steps: [
			{ code: `const project = "${title}";`, duration: 1000 },
			{ code: `const project = "${title}!";`, duration: 1000 },
		],
	};
}

const IMAGE = Asset.create({
	id: "beta-image",
	kind: "image",
	fileName: "beta.png",
	mimeType: "image/png",
	byteSize: 4,
	checksum: "c".repeat(64),
	width: 320,
	height: 200,
});

function layers() {
	const document = readStudioProjectDocument();
	return {
		id: document.project.id,
		texts: document.project.scenes.flatMap((scene) =>
			scene.blocks.flatMap((block) => (block.kind === "text" ? [block.text] : [])),
		),
		assets: document.project.assets.map((asset) => asset.id),
		cues: document.project.audioCues.length,
	};
}

function firstSceneId(): string {
	synchronizeStudioCompositionStore();
	const id = useStudioCompositionStore.getState().value.project.scenes[0]?.id;
	if (!id) throw new Error("expected a scene");
	return id;
}

/** What a page load does: the draft spine first, then the slot's stored layers. */
async function boot(): Promise<void> {
	openStudioProjectDocument(JSON.stringify({ ...payload("Elsewhere"), title: "Reset" }));
	const active = readLocalProjects().projects.find(
		(project) => project.id === readLocalProjects().activeId,
	);
	if (!active) throw new Error("expected an active project");
	useSnippetStore.getState().importFromJson(JSON.stringify(active.project));
	await restoreStudioProject(active.id, () => true, { adoptLegacy: true });
}

async function switchTo(title: string): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
	fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`Open ${title}`) }));
	await act(async () => {
		await vi.waitFor(() => expect(useSnippetStore.getState().snippet.title).toBe(title));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

beforeEach(async () => {
	window.localStorage.clear();
	library.projects.clear();
	ensureActiveLocalProject(payload("Alpha"), { id: "alpha", now: 10 });
	createLocalProject(payload("Beta"), { id: "beta", now: 20 });
	activateLocalProject("alpha");
	await boot();
});

afterEach(cleanup);

describe("switching local projects", () => {
	it("stays on the open project when the chosen one cannot be read, so nothing is saved over it", async () => {
		// A record from another version can name a theme this studio no longer has.
		createLocalProject(
			{ ...payload("Gamma"), themeName: "retired-theme" },
			{ id: "gamma", now: 30 },
		);
		activateLocalProject("alpha");
		render(
			<MemoryRouter>
				<ProjectChip />
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
		fireEvent.click(screen.getByRole("menuitem", { name: /Open Gamma/ }));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(readLocalProjects().activeId).toBe("alpha");
		expect(useSnippetStore.getState().snippet.title).toBe("Alpha");
		expect(useNoticeStore.getState().notices.map((notice) => notice.message)).toContain(
			"Gamma could not be opened, so Alpha stays open.",
		);
	});

	it("keeps each project's layers and media to itself, back and forth and across a reload", async () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addTextLayer(project, firstSceneId(), { text: "Alpha only" }));
		render(
			<MemoryRouter>
				<ProjectChip />
			</MemoryRouter>,
		);

		await switchTo("Beta");
		expect(layers()).toEqual({ id: "beta", texts: [], assets: [], cues: 0 });
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, firstSceneId(), IMAGE, { blockId: "b-img" }));

		await switchTo("Alpha");
		expect(layers()).toEqual({ id: "alpha", texts: ["Alpha only"], assets: [], cues: 0 });

		cleanup();
		await boot();
		expect(layers()).toEqual({ id: "alpha", texts: ["Alpha only"], assets: [], cues: 0 });
		render(
			<MemoryRouter>
				<ProjectChip />
			</MemoryRouter>,
		);
		await switchTo("Beta");
		expect(layers()).toEqual({ id: "beta", texts: [], assets: ["beta-image"], cues: 0 });
		expect((library.projects.get("alpha") as ProjectDocumentV2).project.assets).toEqual([]);
	});

	it("saves the V2 document of the project it leaves", async () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addTextLayer(project, firstSceneId(), { text: "Saved" }));
		render(
			<MemoryRouter>
				<ProjectChip />
			</MemoryRouter>,
		);

		await switchTo("Beta");

		const saved = library.projects.get("alpha") as ProjectDocumentV2;
		expect(saved.schemaVersion).toBe(2);
		expect(
			saved.project.scenes.flatMap((scene) => scene.blocks).some((block) => block.kind === "text"),
		).toBe(true);
	});

	it("hands today's single stored composition to the project open at the first boot, once", async () => {
		library.projects.clear();
		const legacy = createStudioCompositionDocument({
			...readStudioCompositionSnapshot(),
			projectId: "studio-project",
		});
		const sceneId = legacy.project.scenes[0]?.id ?? "";
		const withText = {
			...legacy,
			project: {
				...legacy.project,
				scenes: legacy.project.scenes.map((scene) =>
					scene.id === sceneId
						? {
								...scene,
								blocks: [
									...scene.blocks,
									{
										id: "legacy-text",
										kind: "text" as const,
										text: "Kept",
										opacity: 1,
										placement: { x: 0, y: 0, width: 1, height: 0.2 },
										typography: {
											fontFamily: "Inter",
											fontSize: 48,
											fontWeight: 600,
											color: "#ffffff",
											align: "center" as const,
										},
									},
								],
							}
						: scene,
				),
			},
		};
		library.projects.set("studio-project", withText);

		await boot();

		expect(layers()).toMatchObject({ id: "alpha", texts: ["Kept"] });
		expect(library.projects.has("studio-project")).toBe(false);

		// A project opened later never inherits it.
		await restoreStudioProject("beta");
		expect(layers()).toMatchObject({ id: "beta", texts: [] });
	});
});
