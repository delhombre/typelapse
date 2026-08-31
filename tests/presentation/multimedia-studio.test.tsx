import type { ClientSession } from "@/application/auth/client-auth.port";
import type { HostedProjectSyncState } from "@/application/project/hosted-project-sync";
// @vitest-environment jsdom
import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import { addMediaAsset } from "@/application/project/multimedia-authoring";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { Asset } from "@/domain/entities/asset";
import { Plan } from "@/domain/value-objects/plan";
import type { BrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import {
	MultimediaStudio,
	type MultimediaStudioRuntime,
} from "@/presentation/components/multimedia/multimedia-studio";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}

function store() {
	return createProjectStore(
		createStarterMultimediaProject({
			projectId: "project-1",
			sceneId: "scene-1",
			textBlockId: "title-1",
		}),
	);
}

function localLibrary(
	current: Awaited<ReturnType<LocalProjectLibraryPort["loadCurrent"]>> = null,
): LocalProjectLibraryPort {
	return {
		loadCurrent: vi.fn(async () => current),
		saveProject: vi.fn(async () => undefined),
		loadAsset: vi.fn(async () => null),
		saveAsset: vi.fn(async () => undefined),
	} satisfies LocalProjectLibraryPort;
}

function runtime(overrides: Partial<MultimediaStudioRuntime> = {}): MultimediaStudioRuntime {
	const sources = new Map<string, { assetId: string; src: string }>();
	return {
		deploymentMode: "local",
		registry: {
			register: vi.fn((lease) => {
				sources.set(lease.source.assetId, lease.source);
				return lease.source;
			}),
			resolve: vi.fn((assetId) => sources.get(assetId) ?? null),
			revoke: vi.fn((assetId) => sources.delete(assetId)),
			revokeAll: vi.fn(() => sources.clear()),
		},
		importer: {
			importFile: vi.fn(async () => {
				const asset = Asset.create({
					id: "image-1",
					kind: "image",
					fileName: "cover.jpg",
					mimeType: "image/jpeg",
					byteSize: 1_024,
					checksum: "a".repeat(64),
					width: 1_200,
					height: 800,
				});
				sources.set(asset.id, { assetId: asset.id, src: "blob:cover" });
				return { asset, source: { assetId: asset.id, src: "blob:cover" } };
			}),
		},
		...overrides,
	};
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		x: 0,
		y: 0,
		top: 0,
		left: 0,
		bottom: 720,
		right: 1_200,
		width: 1_200,
		height: 720,
		toJSON: () => ({}),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderStudio(
	projectStore = store(),
	mediaRuntime = runtime(),
	options: {
		readonly authStore?: ReturnType<typeof createAuthStore>;
		readonly planStore?: ReturnType<typeof createPlanStore>;
	} = {},
) {
	return {
		projectStore,
		mediaRuntime,
		...render(
			<MemoryRouter>
				<MultimediaStudio
					store={projectStore}
					runtime={mediaRuntime}
					{...(options.authStore ? { authStore: options.authStore } : {})}
					{...(options.planStore ? { planStore: options.planStore } : {})}
				/>
			</MemoryRouter>,
		),
	};
}

describe("MultimediaStudio", () => {
	it("names the studio with one semantic page heading", () => {
		renderStudio();

		expect(
			screen.getByRole("heading", { level: 1, name: "Untitled story — Typelapse studio" }),
		).toBeTruthy();
	});

	it("loads a previously consented account-scoped project without uploading later edits", async () => {
		const projectStore = store();
		const session: ClientSession = {
			account: { id: "account-1", name: "Ada", email: "ada@example.test" },
			expiresAt: new Date("2026-09-02T12:00:00.000Z"),
		};
		const authStore = createAuthStore({ kind: "local-offline" });
		authStore.setState({
			status: { kind: "authenticated", session },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const planStore = createPlanStore({ deploymentMode: "hosted" });
		planStore.setState({ plan: Plan.pro() });
		const hostedDocument = {
			...createStarterMultimediaProject({
				projectId: "hosted-project-1",
				sceneId: "hosted-scene-1",
				textBlockId: "hosted-title-1",
			}),
			project: {
				...createStarterMultimediaProject({ projectId: "hosted-project-1" }).project,
				id: "hosted-project-1",
				title: "Remote story",
				scenes: createStarterMultimediaProject({
					projectId: "hosted-project-1",
					sceneId: "hosted-scene-1",
					textBlockId: "hosted-title-1",
				}).project.scenes,
			},
		};
		let listener: ((state: HostedProjectSyncState) => void) | null = null;
		const sync = {
			connect: vi.fn(async () => {
				listener?.({ kind: "ready", projectId: "hosted-project-1", revision: 4 });
				return {
					project: {
						id: "hosted-project-1",
						revision: 4,
						document: hostedDocument,
						createdAt: new Date("2026-08-31T10:00:00.000Z"),
						updatedAt: new Date("2026-08-31T10:00:00.000Z"),
					},
					loaded: true,
				};
			}),
			scheduleSave: vi.fn(),
			flush: vi.fn(async () => ({
				outcome: "saved" as const,
				project: {
					id: "hosted-project-1",
					revision: 5,
					document: projectStore.getState().toDocument(),
					createdAt: new Date("2026-08-31T10:00:00.000Z"),
					updatedAt: new Date("2026-08-31T10:01:00.000Z"),
				},
			})),
			importMedia: vi.fn(),
			importFile: vi.fn(),
			refreshMediaSources: vi.fn(),
			getState: vi.fn(() => ({ kind: "disconnected" as const })),
			subscribe: vi.fn((next) => {
				listener = next;
				return () => {
					listener = null;
				};
			}),
			stop: vi.fn(),
		} satisfies BrowserHostedProjectSyncRuntime;
		const references = { load: vi.fn(() => "hosted-project-1"), save: vi.fn() };

		renderStudio(
			projectStore,
			runtime({
				deploymentMode: "hosted",
				createHostedSync: () => sync,
				hostedProjectReferences: references,
			}),
			{ authStore, planStore },
		);

		const title = screen.getByRole("textbox", { name: "Project title" }) as HTMLInputElement;
		await waitFor(() => expect(title.value).toBe("Remote story"));
		expect(references.load).toHaveBeenCalledWith("account-1");
		expect(sync.connect).toHaveBeenCalledWith(
			expect.objectContaining({ session, hostedProjectId: "hosted-project-1" }),
		);
		expect(references.save).toHaveBeenCalledWith("account-1", "hosted-project-1");

		fireEvent.change(title, { target: { value: "Remote story refined" } });
		fireEvent.blur(title);
		await waitFor(() => expect(title.value).toBe("Remote story refined"));
		expect(sync.scheduleSave).not.toHaveBeenCalled();
		expect(sync.flush).not.toHaveBeenCalled();
		expect(screen.getByText("Unsaved cloud changes")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Account for Ada" }));
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() => expect(sync.scheduleSave).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(sync.flush).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByText("Saved to cloud")).toBeTruthy());

		act(() => {
			listener?.({
				kind: "conflict",
				projectId: "hosted-project-1",
				localRevision: 4,
				currentRevision: 5,
			});
		});
		await waitFor(() =>
			expect(screen.getAllByText("Cloud copy needs attention").length).toBeGreaterThan(0),
		);
	});

	it("does not connect or upload an authenticated project without prior cloud consent", async () => {
		const session: ClientSession = {
			account: { id: "account-new", name: "Grace", email: "grace@example.test" },
			expiresAt: new Date("2026-09-02T12:00:00.000Z"),
		};
		const authStore = createAuthStore({ kind: "local-offline" });
		authStore.setState({
			status: { kind: "authenticated", session },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const planStore = createPlanStore({ deploymentMode: "hosted" });
		const createHostedSync = vi.fn();
		const references = { load: vi.fn(() => null), save: vi.fn() };

		renderStudio(
			store(),
			runtime({
				deploymentMode: "hosted",
				createHostedSync,
				hostedProjectReferences: references,
			}),
			{ authStore, planStore },
		);

		await waitFor(() => expect(references.load).toHaveBeenCalledWith("account-new"));
		expect(createHostedSync).not.toHaveBeenCalled();
		expect(references.save).not.toHaveBeenCalled();
		expect(screen.getByText("On this device")).toBeTruthy();
	});

	it("creates the first private cloud copy only after the authenticated user asks", async () => {
		const session: ClientSession = {
			account: { id: "account-new", name: "Grace", email: "grace@example.test" },
			expiresAt: new Date("2026-09-02T12:00:00.000Z"),
		};
		const authStore = createAuthStore({ kind: "local-offline" });
		authStore.setState({
			status: { kind: "authenticated", session },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const planStore = createPlanStore({ deploymentMode: "hosted" });
		let listener: ((state: HostedProjectSyncState) => void) | null = null;
		let pendingDocument = createStarterMultimediaProject({ projectId: "hosted-project-1" });
		const sync = {
			connect: vi.fn(async (input) => {
				pendingDocument = {
					...input.localDocument,
					project: { ...input.localDocument.project, id: "hosted-project-1" },
				};
				listener?.({ kind: "ready", projectId: "hosted-project-1", revision: 1 });
				return {
					project: {
						id: "hosted-project-1",
						revision: 1,
						document: pendingDocument,
						createdAt: new Date("2026-08-31T10:00:00.000Z"),
						updatedAt: new Date("2026-08-31T10:00:00.000Z"),
					},
					loaded: false,
				};
			}),
			scheduleSave: vi.fn((document) => {
				pendingDocument = document;
			}),
			flush: vi.fn(async () => ({
				outcome: "saved" as const,
				project: {
					id: "hosted-project-1",
					revision: 2,
					document: pendingDocument,
					createdAt: new Date("2026-08-31T10:00:00.000Z"),
					updatedAt: new Date("2026-08-31T10:01:00.000Z"),
				},
			})),
			importMedia: vi.fn(),
			importFile: vi.fn(),
			refreshMediaSources: vi.fn(),
			getState: vi.fn(() => ({
				kind: "ready" as const,
				projectId: "hosted-project-1",
				revision: 2,
			})),
			subscribe: vi.fn((next) => {
				listener = next;
				return () => {
					listener = null;
				};
			}),
			stop: vi.fn(),
		} satisfies BrowserHostedProjectSyncRuntime;
		const createHostedSync = vi.fn(() => sync);
		const references = { load: vi.fn(() => null), save: vi.fn() };
		const projectStore = store();

		renderStudio(
			projectStore,
			runtime({
				deploymentMode: "hosted",
				createHostedSync,
				hostedProjectReferences: references,
			}),
			{ authStore, planStore },
		);

		await waitFor(() => expect(references.load).toHaveBeenCalledWith("account-new"));
		expect(createHostedSync).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Account for Grace" }));
		fireEvent.click(screen.getByRole("button", { name: "Save this project to cloud" }));

		await waitFor(() => expect(sync.connect).toHaveBeenCalledTimes(1));
		expect(sync.connect).toHaveBeenCalledWith(
			expect.objectContaining({
				session,
				localDocument: expect.objectContaining({ schemaVersion: 2 }),
			}),
		);
		await waitFor(() =>
			expect(references.save).toHaveBeenCalledWith("account-new", "hosted-project-1"),
		);
		expect(projectStore.getState().value.project.id).toBe("hosted-project-1");
		await waitFor(() => expect(screen.getByText("Saved to cloud")).toBeTruthy());
	});
	it("presents a scene-first multimedia workflow instead of a PR or Steps workflow", () => {
		renderStudio();

		expect(screen.getByRole("button", { name: "Add source" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe(
			"true",
		);
		expect(screen.getByRole("region", { name: "Canvas" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Project timeline" })).toBeTruthy();
		expect(screen.queryByText("Steps")).toBeNull();
		expect(screen.queryByText(/pull request|github/i)).toBeNull();
	});

	it("keeps creation contextual instead of turning the main rail into a dashboard", () => {
		renderStudio();

		expect(screen.queryByRole("button", { name: "Text" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Add source" }));

		expect(screen.getByRole("menu", { name: "Add source" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Text" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Code" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Image or video" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Audio" })).toBeTruthy();
	});

	it("keeps look and playback-loop decisions functional inside the compact camera rail", () => {
		const projectStore = store();
		renderStudio(projectStore);

		fireEvent.click(screen.getByRole("button", { name: "Look" }));
		expect(screen.getByRole("button", { name: "Look" }).getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(screen.getByRole("button", { name: "Aurora" }));
		expect(projectStore.getState().value.project.canvas.background).toBe("mesh:aurora");

		const loop = screen.getByRole("button", { name: "Loop" });
		expect(loop.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(loop);
		expect(loop.getAttribute("aria-pressed")).toBe("true");
	});

	it("opens an honest local export surface instead of claiming an unavailable video render", () => {
		renderStudio();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		expect(screen.getByRole("dialog", { name: "Export your project" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Download project file" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Render MP4/i })).toBeNull();
		expect(screen.queryByText(/ready when the hosted renderer/i)).toBeNull();
	});

	it("offers real account-free video rendering when the local runtime is ready", async () => {
		const library = localLibrary();
		renderStudio(
			store(),
			runtime({
				localLibrary: library,
				localRender: { render: vi.fn(async () => new Blob(["video"], { type: "video/mp4" })) },
			}),
		);

		await waitFor(() => expect(screen.getByText("Saved on device")).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		expect(screen.getByText("Local renderer")).toBeTruthy();
		expect(screen.getByRole("button", { name: /render video/i })).toBeTruthy();
	});

	it("adds a text layer and opens the matching contextual inspector", () => {
		const projectStore = store();
		renderStudio(projectStore);

		fireEvent.click(screen.getByRole("button", { name: "Add source" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Text" }));

		expect(projectStore.getState().value.project.scenes[0]?.blocks).toHaveLength(2);
		expect(screen.getByRole("region", { name: "Text properties" })).toBeTruthy();
	});

	it("imports real media metadata into the project and keeps the preview source ephemeral", async () => {
		const projectStore = store();
		const library = localLibrary();
		const mediaRuntime = runtime({ localLibrary: library });
		const { container } = renderStudio(projectStore, mediaRuntime);
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');
		const file = new File([new Uint8Array(1_024)], "cover.jpg", { type: "image/jpeg" });

		fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

		await waitFor(() => expect(projectStore.getState().value.project.assets).toHaveLength(1));
		expect(projectStore.getState().value.project.scenes[0]?.blocks[0]).toMatchObject({
			kind: "image",
			assetId: "image-1",
		});
		expect(projectStore.getState().value.project.scenes[0]?.blocks.at(-1)).toMatchObject({
			kind: "text",
		});
		expect(projectStore.getState().toDocument().project).not.toHaveProperty("source");
		expect(JSON.stringify(projectStore.getState().toDocument())).not.toContain("blob:cover");
		expect(library.saveAsset).toHaveBeenCalledWith({
			projectId: "project-1",
			assetId: "image-1",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			opaqueHandle: file,
		});
		expect(screen.getByText("cover.jpg added")).toBeTruthy();
	});

	it("selects imported audio on the global rail and edits it without leaving the studio", async () => {
		const projectStore = store();
		const audioAsset = Asset.create({
			id: "audio-1",
			kind: "audio",
			fileName: "pulse.wav",
			mimeType: "audio/wav",
			byteSize: 2_048,
			checksum: "c".repeat(64),
			durationMs: 8_000,
		});
		const mediaRuntime = runtime({
			importer: {
				importFile: vi.fn(async () => ({
					asset: audioAsset,
					source: { assetId: audioAsset.id, src: "blob:pulse" },
				})),
			},
		});
		const { container } = renderStudio(projectStore, mediaRuntime);
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');

		fireEvent.change(input as HTMLInputElement, {
			target: { files: [new File([new Uint8Array(2_048)], "pulse.wav", { type: "audio/wav" })] },
		});

		await waitFor(() =>
			expect(screen.getByRole("region", { name: "Audio properties" })).toBeTruthy(),
		);
		expect(projectStore.getState().value.project.audioCues).toHaveLength(1);
		fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
			target: { value: "35" },
		});
		expect(projectStore.getState().value.project.audioCues[0]?.gain).toBe(0.35);

		fireEvent.click(screen.getByRole("button", { name: "Delete audio cue" }));
		expect(projectStore.getState().value.project.audioCues).toHaveLength(0);
		expect(screen.getByRole("region", { name: "Scene 1 timing" })).toBeTruthy();
	});

	it("edits scene rhythm and reorders scenes through the wired timeline", () => {
		const projectStore = store();
		renderStudio(projectStore);

		fireEvent.click(screen.getByRole("button", { name: /Scene 1,/ }));
		fireEvent.change(screen.getByRole("spinbutton", { name: "Scene duration" }), {
			target: { value: "4.2" },
		});
		expect(projectStore.getState().value.project.scenes[0]?.durationMs).toBe(4_200);

		fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
		const secondSceneId = projectStore.getState().selectedSceneId;
		const secondSceneButton = screen.getByRole("button", { name: /Scene 2,/ });
		fireEvent.keyDown(secondSceneButton, { key: "ArrowLeft", altKey: true });

		expect(projectStore.getState().value.project.scenes[0]?.id).toBe(secondSceneId);
	});

	it("restores the current local project before enabling durable autosave", async () => {
		const starter = createStarterMultimediaProject({
			projectId: "saved-project",
			sceneId: "saved-scene",
			textBlockId: "saved-title",
		});
		const recovered = {
			...starter,
			project: { ...starter.project, title: "Recovered story" },
		};
		const library = localLibrary(recovered);

		renderStudio(store(), runtime({ localLibrary: library }));

		const title = screen.getByRole("textbox", { name: "Project title" }) as HTMLInputElement;
		await waitFor(() => expect(title.value).toBe("Recovered story"));
		expect(library.loadCurrent).toHaveBeenCalledTimes(1);
		fireEvent.change(title, { target: { value: "Recovered cut" } });
		fireEvent.blur(title);
		await waitFor(
			() =>
				expect(library.saveProject).toHaveBeenCalledWith(
					expect.objectContaining({
						project: expect.objectContaining({ id: "saved-project", title: "Recovered cut" }),
					}),
				),
			{ timeout: 1_000 },
		);
	});

	it("rehydrates persisted media bytes into ephemeral preview URLs", async () => {
		const base = createStarterMultimediaProject({
			projectId: "saved-project",
			sceneId: "saved-scene",
			textBlockId: "saved-title",
		});
		const persistedStore = createProjectStore(base);
		const asset = Asset.create({
			id: "saved-image",
			kind: "image",
			fileName: "cover.jpg",
			mimeType: "image/jpeg",
			byteSize: 4,
			checksum: "b".repeat(64),
			width: 1_200,
			height: 800,
		});
		persistedStore.getState().transact((project) =>
			addMediaAsset(project, "saved-scene", asset, {
				blockId: "saved-image-block",
				cueId: "unused-cue",
			}),
		);
		const saved = persistedStore.getState().toDocument();
		const library = localLibrary(saved);
		library.loadAsset = vi.fn(async () => ({
			assetId: "saved-image",
			mimeType: "image/jpeg",
			byteSize: 4,
			opaqueHandle: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" }),
		}));
		const sourceFactory = {
			create: vi.fn(() => ({
				source: { assetId: "saved-image", src: "blob:restored-cover" },
				release: vi.fn(),
			})),
		};
		const { container } = renderStudio(store(), runtime({ localLibrary: library, sourceFactory }));

		await waitFor(() =>
			expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:restored-cover"),
		);
		expect(sourceFactory.create).toHaveBeenCalledWith(
			"saved-image",
			expect.objectContaining({
				name: "cover.jpg",
				mimeType: "image/jpeg",
				byteSize: 4,
			}),
			{},
		);
	});

	it("keeps deletion immediate but disables it when it would leave an invalid empty project", () => {
		renderStudio();
		expect(
			(screen.getByRole("button", { name: "Delete selected scene" }) as HTMLButtonElement).disabled,
		).toBe(true);
	});

	it("moves the playhead into a newly added scene instead of leaving the previous frame visible", () => {
		renderStudio();

		fireEvent.click(screen.getByRole("button", { name: "Add scene" }));

		expect(screen.getByRole("button", { name: /Scene 2/ }).getAttribute("aria-pressed")).toBe(
			"true",
		);
		expect(screen.queryByRole("button", { name: "Select text layer" })).toBeNull();
	});
});
